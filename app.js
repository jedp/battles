// eval config
var fs = require('fs');
eval(fs.readFileSync('config.js', "ascii"));

var express = require('express');
var mongoose = require('mongoose/').Mongoose;
var ObjectID = require('mongodb/bson/bson').ObjectID;
var crypto = require('crypto');

var app = module.exports = express.createServer();

// ----------------------------------------------------------------------
// bandnames database

mongoose.model('Bandname', {
    properties: ['name', 'updated_at', 'random', 'votes'],

    cast: {
        votes: Number,
        name: String
    },

    indexes: ['random'],

    methods: {
        save: function(f) {
            this.random = Math.random();
            this.updated_at = new Date();
            this.__super__(f);
        }
    },

    static: {
        getRandom: function(other_than_this) {
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

var db = mongoose.connect('mongodb://localhost/bandname');
var Bandname = db.model('Bandname');

// Configuration

app.configure(function(){
  app.set('views', __dirname + '/views');
  app.set('view engine', 'jade');
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

getTwoCandidates = function(callback) {
    var self = this;
    var first, second;
    Bandname.getRandom().one(function(result) {
        first = result;
        Bandname.getRandom(first).one(function(result) {
            second = result;

            var results = {
                    first: first,
                    second: second,
                    secure_hash: makeSecureHash(first, second)
            };
            callback(results);
        });
    });
};

app.get('/battle', function(req, res) {
    getTwoCandidates(function(locals) {
        locals.title = "Band Name Battles!";
        locals.here = 'battle'
        res.render('battle', {locals: locals});
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
                candidate.votes += 1;
                candidate.save();
            }
        });
    } 
    getTwoCandidates(function(candidates) {
        res.send(JSON.stringify(candidates),
                 {'Content-Type': 'text/plain'},
                 200);
    });
});

app.get('/submit', function(req, res) {
    res.render('submit',  {
        locals: {
            title: 'Awesome Band Name?',
            newname: null,
            here: 'submit'
        }
    });
});

app.post('/submit', function(req, res) { 
    var bandname = new Bandname();
    bandname.name = req.param('name');
    bandname.votes = 0;
    bandname.save();
    res.render('submit', {
        locals: { 
            title: 'Awesome Band Name?',
            newname: bandname.name,
            here: 'submit'
        }
    });
});


app.get('/stats', function(req, res) {
    var best_name = worst_name = "???";
    Bandname.find().sort([['votes', 'descending']]).first(function(result) {
        best_name = result.name;
        best_votes = result.votes;
    }).last(function(result) {
        worst_name = result.name;
        worst_votes = result.votes;
        res.render('stats', {
            locals: {
                title: "Band Name Battles!",
                best_name: best_name,
                best_votes: best_votes,
                worst_name: worst_name,
                worst_votes: worst_votes,
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
