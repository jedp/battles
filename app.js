// eval config
var fs = require('fs');
eval(fs.readFileSync('config.js', "ascii"));

var express = require('express');
var mongoose = require('mongoose/').Mongoose;
var ObjectID = require('mongodb/bson/bson').ObjectID;
var crypto = require('crypto');

var app = module.exports = express.createServer();

const NOT_NEW = "Already a band by that name.";

// ----------------------------------------------------------------------
// bandnames database

var db = mongoose.connect('mongodb://localhost/bandname');

mongoose.model('Bandname', {
    properties: ['name', 'slug', 'updated_at', 'random', 'votes'],

    cast: {
        votes: Number,
        name: String
    },

    indexes: ['random', 'name', 'slug'],

    methods: {
        isUnique: function(success, error) {
            var self = this;
            Bandname.find({_id: {$ne: self._id}, name: self.name}).all(
                function(results) {
                    results.length && error(NOT_NEW) || success();
                }
            );
        },    

        voteFor: function(success, error) {
            this.votes += 1;
            this.save(success, error);
        },

        makeSlug: function(success, error, nextslug) {
            var self = this;
            slug = self.name.replace(/['"]/g, '').replace(/\W+/g, '-').toLowerCase();

            if (typeof nextslug != 'undefined') {
                slug += '-' + nextslug;
                self._nextslug = nextslug + 1;
            } else { 
                self._nextslug = 1;
            }

            self.slug = slug;

            return Bandname.find({_id:{$ne:self._id}, slug: self.slug}).all(function(results) {
                if (results.length) {
                    // already a document with this slug
                    // so try again by incrementing the suffix
                    self.makeSlug(success, error, self._nextslug);
                } else {
                    success();
                }
            });
        },

        save: function(success, error) {
            var self = this;

            // always reset the random parameter when saving to 
            // keep randomizing the order and, more importantly, 
            // the distance between elements in the set
            this.random = Math.random();
            this.updated_at = new Date();

            if ( this.isNew ) {
                // trim extra whitespace on new names
                self.name = this.name.replace(/\s+/g, ' ').trim();
                self.votes = 1;

                // now see if it's really unique
                return this.isUnique( 
                    function() { 
                        self.makeSlug( function() { 
                            // the name is unique, and we have made a unique slug for it
                            // all is good and well
                            self.__super__(success) 
                        })
                    },
                    function(why) {
                        // error - not a unique name
                        error(why);
                    }
                );
            } else {
                // bandname isn't new - we're just saving regularly
                self.__super__(success);
            }
        }
    },

    static: {
        findRandom: function(other_than_this) {
            // find entries in a random order.
            // If provided, exclude `other_than_this` from the result set.
            rand = Math.random();

            if (other_than_this) {
                skip_id = other_than_this._id;
            } else {
                skip_id = null;
            }

            return this.find( {_id: {'$ne': skip_id}, 
                               '$or': [ {'random': {'$gte': rand}} ,
                                        {'random': {'$lte': rand}} ]} );
        }
    }
});

var Bandname = db.model('Bandname');

// Configuration

app.configure(function(){
  app.set('views', __dirname + '/views');
  app.set('view engine', 'jade');

  // support for sessions
  app.use(express.cookieDecoder());
  app.use(express.session());

  app.use(express.logger({format: ':url :method :response-timems :status HTTP:http-version :remote-addr :date'}));
  app.use(express.bodyDecoder());
  app.use(express.methodOverride());
  app.use(app.router);
  app.use(express.staticProvider(__dirname + '/public'));
});

app.configure('development', function(){
  app.use(express.errorHandler({ dumpExceptions: true, showStack: true })); 
});

app.configure('production', function(){
  app.use(express.errorHandler()); 
});

// Routes

makeSecureHash = function(first, second) {
    return (new crypto.Hash("md5"))
        .update(settings.secret)
        .update(JSON.stringify(first._id))
        .update(JSON.stringify(second._id))
        .update(first.votes)
        .update(second.votes).digest("hex");
};


getCandidate = function(callback, not_this_one) {
    Bandname.findRandom(not_this_one).one(function(result) {
        callback(result);
    });
};

maybeSwitchCandidates = function(session, candidate, callback) {
    if (session.favorite) {
        if (session.favorite.id == candidate._id.toHexString()) {
            if (session.favorite.votes > settings.max_consecutive_votes) {
                // too many votes for the same candidate
                getCandidate(callback, candidate);
                return;
            }
            // increment vote
            session.favorite.votes += 1;
        } else {
            // change vote
            session.favorite = {'id': candidate._id.toHexString(), 'votes': 1};
        }
    } else {
        // init session data
        session.favorite = {'id': candidate._id.toHexString(), 'votes': 1};
    }
    callback(candidate);
};

renderGetBattle = function(req, res, first, second) {
    res.render('battle', {
        locals: {
            title: "Band Name Battles!",
            here: 'batte',
            settings: settings,
            first: first,
            second: second,
            secure_hash: makeSecureHash(first, second)
        }
    });
};
app.get('/battle', function(req, res) {
    getCandidate(function(first){
        getCandidate(function(second, req){
            renderGetBattle(req, res, first, second);
            }, 
        first);
    });
});

app.get('/battle/:slug', function(req, res) {
    Bandname.find({slug: req.params.slug}).first(function(first){
        getCandidate(function(second) {
            renderGetBattle(req, res, first, second);
        }, first);
    });
});

app.post('/vote', function(req, res) {
    // assume json body; return json response
    // containing two more candidates to vote for
    var params = req.body;

    // make sure there's been no tinkering with the hashes
    if (params.secure_hash != makeSecureHash(params.first, params.second)) {
            res.send(401);
        } else {

        Bandname.findById(params.choice).one(function(candidate) {
            // make sure they're not replaying the same vote
            // @@@

            // make sure they're voting for one of the options given
            if (candidate._id.toHexString() != params.first._id &&
                candidate._id.toHexString() != params.second._id ) {
                res.send(401);
            } else {
                candidate.voteFor(
                    function() { // vote succeeded
                        maybeSwitchCandidates(req.session, candidate, function(candidate) {
                            getCandidate( function(another) {
                                    res.send(
                                        JSON.stringify({
                                            first:candidate,
                                            second:another,
                                            secure_hash:makeSecureHash(candidate, another)
                                            }),
                                        {'Content-Type': 'text/plain'},
                                        200);
                                    }, 
                                // pick a candidate other than this one
                                candidate);
                            });
                        }, 
                    function(why) { // voteFor failed!
                        res.render('error', { 
                            locals: { title: "No vote for you", errstr: why }} );
                    });
            }
        });
    } 
});

app.get('/submit', function(req, res) {
    res.render('submit',  {
        locals: {
            settings: settings,
            title: 'Awesome Band Name?',
            here: 'submit'
        }
    });
});

app.post('/submit', function(req, res) { 
    var bandname = new Bandname();
    bandname.name = req.param('name');
    bandname.save(
        function() {
            // battle the new bandname
            res.redirect('/battle/'+bandname.slug);
        },
        function(why) {
            if (why == NOT_NEW) {
                res.render('submit', {
                    locals: {
                        title: 'Awesome Band Name?',
                        message: why,
                        here: 'submit'
                    }
                });
            } else {
                res.render('error', {
                    locals: { title: "No band name for you", errstr: why }});
            }    
        }
    );
});


app.get('/stats', function(req, res) {
    Bandname.find().sort([['votes', 'descending']]).all(function(results) {
        var total = results.length
        var slice = Math.min(settings.stats_length, total-1);
        var best = [];
        for (var i=0; i<slice; i++) {
            best.push(results[i]);
        }
        worst = results[results.length-1];
        res.render('stats', {
            locals: {
                settings: settings,
                title: "Best of " + total + " contenders",
                best: best,
                worst: worst,
                total: total,
                here: 'stats'
            }
        });
    });
});
        
app.get('/', function(req, res) {
    res.redirect('/battle');
});


// Only listen on $ node app.js

if (!module.parent) {
  app.listen(settings.port);
  console.log("Express server listening on port %d", app.address().port)
}
