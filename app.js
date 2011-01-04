var express = require('express');
var mongoose = require('mongoose/').Mongoose;
var ObjectID = require('mongodb/bson/bson').ObjectID;
var crypto = require('crypto');

var app = module.exports = express.createServer();

// secret is used to hash form values with other data to prevent cheating
var secret = "Attack at Dawn!!!";


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

app.get('/battle', function(req, res){
    var first, second;
    Bandname.getRandom().one(function(result) {
        first = result;
        Bandname.getRandom(first).one(function(result) {
            second = result;
            var first_id = new ObjectID(first._id).id.toHexString();
            var second_id = new ObjectID(second._id).id.toHexString();
            var hash = (new crypto.Hash("md5"))
                .update(secret)
                .update(first_id)
                .update(second_id)
                .update(first.votes)
                .update(second.votes).digest("hex");
            res.render('battle', {
                locals: {
                    title: 'Band Name Battles!',
                    first_name: first.name,
                    first_id: first_id,
                    first_votes: first.votes,
                    second_name: second.name,
                    second_id: second_id,
                    second_votes: second.votes,
                    hash: hash, 
                    here: 'battle'
                }
            });
        });
    });
});

app.post('/battle', function(req, res) {
    // a vote for a band
    // to prevent cheating, we make sure the hashes work out right 
    var hash = req.param('hash');
    var a_id = req.param('a_id');
    var b_id = req.param('b_id');
    var a_votes = req.param('a_votes');
    var b_votes = req.param('b_votes');

    // make sure there's been no tampering with the votes ...
    var check_hash = (new crypto.Hash("md5"))
        .update(secret)
        .update(a_id)
        .update(b_id)
        .update(a_votes)
        .update(b_votes).digest("hex");
    if (hash != check_hash) {
        // Naughty!  Tinkering with the hash
            res.render('naughty');
        } else {
        // vote for me!
        Bandname.find({name: req.param('vote')}).one(function(candidate) {
            if (candidate._id != ObjectID.createFromHexString(a_id).id &&
                candidate._id != ObjectID.createFromHexString(b_id).id ) {
                // Naughty! Someone trying to vote for a different band name
                // from the ones actually given.
                res.render('naughty');
            } else {
                candidate.votes += 1;
                candidate.save();
                res.redirect("/battle");
            }
        });
    } 
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
  app.listen(3000);
  console.log("Express server listening on port %d", app.address().port)
}
