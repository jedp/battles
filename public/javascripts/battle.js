var battles = new Object();

battles.Battle = function() {
    var self = this;  
    self.first = new Object;
    self.second = new Object;
    self.secure_hash = "";

    self._bootstrap = function() {
        self.first._id = $('#first_id').val();
        self.first.name = $('#first_name').val();
        self.first.votes = $('#first_votes').val();
        self.second._id = $('#second_id').val();
        self.second.name = $('#second_name').val();
        self.second.votes = $('#second_votes').val();
        self.secure_hash = $('#secure_hash').val();
    };

    self.vote = function(which) {
        $('#battle').fadeOut('fast', function() {
            $.ajax({
                url: '/vote',
                type: 'POST',
                dataType: 'json',
                data: {first: self.first,
                       second: self.second,
                       secure_hash: self.secure_hash,
                       choice: which._id},
                success: function(result) {
                    // result contains two more candidates to vote for
                    self.first = result.first;
                    self.second = result.second;
                    self.secure_hash = result.secure_hash;

                    $('#vote_for_first').html(self.first.name);
                    $('#vote_for_second').html(self.second.name);
                    $('#battle').fadeIn('slow');
                }

            });
        });
    };

    self.wage = function() {
        self._bootstrap();
        $('#vote_for_first').bind('click', function() { self.vote(self.first) });
        $('#vote_for_second').bind('click', function() { self.vote(self.second) });
        $('#battle').fadeIn();
    };

    return self;
};

