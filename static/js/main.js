$(document).ready(function() {
    //Connect to the socket server...
    var socket = io.connect('http://localhost:4000');

    /***********************************\
    *       Helper functions
    \***********************************/

    function room_add(room) {
        var room_item = $('#room_item_template')
            .clone()
            .removeAttr('id')
            .attr('room_id', room.room_id)
            .appendTo('#room_list');
        room_item.find('.room_name').html(room.name);
        room_item.find('.room_description').html(room.description);
        room_item.find('.room_users').html(room.users.length + ' Users');
        room_item.find('.room_groups').html(room.groups.join(', ') || '&nbsp;');
    }

    function user_join(room_id, user) {
        console.log('user_join');
        var chat_room = $('.chat_room[room_id='+room_id+']');
        var user_item =  chat_room.find('.user_item_template')
            .clone()
            .removeClass('user_item_template')
            .attr('user_id', user.user_id)
            .appendTo(chat_room.find('.chat_users'));
        user_item.find('.user_username').html(user.username);
    }

    function showChat(room_id) {
        $('.chat_room').hide();
        $('.chat_room[room_id='+room_id+']').show();
        $('.chat_tab[room_id='+room_id+'] .chat_select').attr('checked', true);
    }

    /**********************************\
    *   Socket handlers (general)
    \**********************************/
    socket.on('error', function(data) {
        console.log('socket.on:error');
        console.log(data);
        $('#error')
            .stop(true, true)
            .hide()
            .html(data.reason)
            .show()
            .fadeOut(3000);
    });

    socket.on('disconnect', function(data) {
        console.log('socket.on:disconnect');
        //Socket is disconnected, reload the window to start over
        window.location.reload(true);
    });

    socket.on('login', function(data) {
        console.log('socket.on:login');
        //Give UI feedback
        $('#login').hide();
        $('#main').show();
        //Get the list of rooms
        socket.emit('room_list');
    });

    /**********************************\
    *   Socket handlers (user)
    \**********************************/
    socket.on('user_join', function(data) {
        console.log('socket.on:user_join');
        user_join(data.room_id, data.user);
    });

    socket.on('user_leave', function(data) {
        console.log('socket.on:user_leave');
        //TODO
        console.log(data);
    });

    /**********************************\
    *   Socket handlers (room)
    \**********************************/
    socket.on('room_add', function(data) {
        console.log('socket.on:room_add');
        //Add the room to the list
        room_add(data);
    });

    socket.on('room_remove', function(data) {
        console.log('socket.on:room_remove');
        //TODO
        console.log(data);
        $('[room_id='+data.room_id+']').remove();
    });

    socket.on('room_message', function(data) {
        console.log('socket.on:room_message');
        var html = '';
        html += data.timestamp;
        html += ': ';
        html += data.username;
        html += ': ';
        html += data.msg;
        html += '\n';
        $('.chat_room[room_id='+data.room_id+'] .chat_log pre').append(html);
    })

    socket.on('room_list', function(data) {
        console.log('socket.on:room_list');
        data.rooms.forEach(room_add);
    });

    socket.on('room_join', function(data) {
        console.log('socket.on:room_join');
        //Create a chat button
        var chat_tab = $('#chat_tab_template')
            .clone()
            .removeAttr('id')
            .attr('room_id', data.room_id)
            .appendTo('#chat_list');
        chat_tab.find('.chat_name').html(data.name);

        //Create a chat window
        var chat_room = $('#chat_room_template')
            .clone()
            .removeAttr('id')
            .attr('room_id', data.room_id)
            .appendTo('#chat_windows');

        //Show users
        data.users.forEach(function(user) {
            user_join(data.room_id, user);
        });

        //Show the chat room
        showChat(data.room_id);
    });

    socket.on('room_leave', function(data) {
        console.log('socket.on:room_leave');
        //Remove UI stuff
        $('.chat_tab[room_id='+room_id+']').remove();
        $('.chat_room[room_id='+room_id+']').remove();
    });


    /***********************************\
    *       Click handlers
    \***********************************/

    $('#do_login').click(function() {
        //Login now!
        console.log('Logging in...');
        $('#login_fail').hide();
        socket.emit(
            'login',
            {
                username: $('#username').val(),
                password: $('#password').val()
            });
    })

    $(document).on('click', '.room_join', function(e) {
        var room_id = $(e.currentTarget).closest('[room_id]').attr('room_id');
        socket.emit(
            'room_join',
            {
                room_id: room_id
            });
    });

    $(document).on('click', '.chat_select', function(e) {
        var room_id = $(e.currentTarget).closest('[room_id]').attr('room_id');
        showChat(room_id);
    });

    $(document).on('click', '.chat_close', function(e) {
        var room_id = $(e.currentTarget).closest('[room_id]').attr('room_id');
        console.log('chat_close:'+room_id);
        //Tell the server we're leaving
        socket.emit(
            'room_leave',
            {
                room_id: room_id
            });
    });

    function send_message(e) {
        var jqe = $(e.currentTarget),
            room_id = jqe.closest('[room_id]').attr('room_id'),
            input = jqe.closest('.chat_input input');
        console.log('send_message:'+room_id+', '+input.val());
        //Send the message to the server
        socket.emit(
            'room_message',
            {
                room_id: room_id,
                msg: input.val()
            });
        //Clear the input
        input.val('');
    }

    $(document).on('keypress', '.chat_input input', function(e) {
        if (e.charCode === 13) {
            send_message(e);
        }
    });

    $(document).on('click', '.chat_input button', send_message);
});
