/*
Create user
Login
List rooms
Create room
Join room
Post to room
Post to user
*/
var io = require('socket.io').listen(4000),
    _ = require('underscore');

var groups = {},
    users = {},
    rooms = {};

var _new_id = 1;
function new_id() {
    return '' + _new_id++;
}

function add_group(name, group_id) {
    group_id = group_id || new_id();
    groups[group_id] = {
        group_id: group_id,
        name: name
    };
    return group_id;
}

function add_user(username, password, groups, user_id) {
    user_id = user_id || new_id();
    users[user_id] = {
        user_id: user_id,
        username: username,
        password: password,
        groups: groups,
        socket: undefined
    };
    return user_id;
}

function add_room(name, description, groups, room_id) {
    room_id = room_id || new_id();
    rooms[room_id] = {
        room_id: room_id,
        name: name,
        description: description,
        groups: groups,
        users: []
    };
    return room_id;
}

var admin_group = add_group('admin');
add_user('admin', 'admin', [admin_group])
add_user('admin2', 'admin', [admin_group])
add_room('test', 'Testing room', [admin_group])
add_room('test2', 'Testing room 2', [admin_group])


function post_message(room, username, msg) {
    console.log(post_message);
    var timestamp = (new Date()).toString();
    room.users.forEach(function(user) {
        user.socket.emit(
            'room_message',
            {
                room_id: room.room_id,
                username: username,
                timestamp: timestamp,
                msg: msg
            });
    });
}

io.sockets.on('connection', function(socket) {
    /*
    socket.on('input', function(data) {
        socket.emit('output', {});
    });
    */
    var login_listener = function(data) {
        console.log('Got login...');
        var possible_users = _.where(users, {username: data.username});
        if (possible_users.length !== 1) {
            console.log('Login fail - user "' + data.username + '" not found!');
            return socket.emit(
                'login',
                {
                    success: false,
                    reason: 'User "' + data.username + '" not found!'
                });
        }
        var user = possible_users[0];
        if (user.password !== data.password) {
            console.log('Login fail - incorrect password!');
            return socket.emit(
                'login',
                {
                    success: false,
                    reason: 'Incorrect password!'
                });
        }
        console.log('Login success!');
        user.socket = socket;

        //Login was successful; don't let them login again on the same WS!
        socket.removeListener('login', login_listener);

        //Now add the functions which are available after login
        socket.on('room_list', function(data) {
            //Give the client the list of rooms they can join
            var client_rooms = [];
            _.forEach(rooms, function(room) {
                    if (_.intersection(room.groups, user.groups).length === 0) {
                        //This client cannot see this room
                        return;
                    }
                    client_rooms.push({
                        room_id: room.room_id,
                        name: room.name,
                        description: room.description
                    });
                });
            return socket.emit(
                'room_list',
                {
                    success: true,
                    rooms: client_rooms
                });
        })


        socket.on('room_join', function(data) {
            console.log('room_join...');
            console.log(data);
            var room = _.findWhere(rooms, {room_id: data.room_id});
            socket.emit(
                'room_join',
                {
                    room_id: room.room_id,
                    name: room.name,
                    users: _.pluck(room.users, 'username')
                });
            room.users.push(user);
            post_message(room, 'SERVER', user.username + ' joined the room.');
        })

        //Now let the client know they are logged in
        return socket.emit(
            'login',
            {
                success: true
            });
    };
    socket.on('login', login_listener);
});
