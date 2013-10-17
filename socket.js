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


function post_message(room, type, data) {
    data = data || {};
    data.room_id = room.room_id;
    data.timestamp = (new Date()).toString();
    room.users.forEach(function(user) {
        user.socket.emit(type, data);
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
                'error',
                {
                    reason: 'Login failed: User "' + data.username + '" not found!'
                });
        }
        var user = possible_users[0];
        if (user.password !== data.password) {
            console.log('Login fail - incorrect password!');
            return socket.emit(
                'error',
                {
                    reason: 'Login failed: Incorrect password!'
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
                        description: room.description,
                        users: _.pluck(room.users, 'username'),
                        groups: _.pluck(room.groups, 'name')
                    });
                });
            return socket.emit(
                'room_list',
                {
                    rooms: client_rooms
                });
        })

        socket.on('room_join', function(data) {
            console.log('room_join...');
            var room = _.findWhere(rooms, {room_id: data.room_id});
            //Check the room exists
            if (!room) {
                return socket.emit(
                    'error',
                    {
                        reason: 'Room Join failed: Cannot find room '+data.room_id+'!'
                    });
            }
            room_join(room);
        });

        var room_join = function(room, after_login) {
            /*
            The current user is trying to join this room.
            If after_login is true, this is the server trying to reconnect the user
            to their previous rooms. Therefore:
              * Dont throw errors
              * Only allow the user to join if they are already in the room
              * Dont add the user to the room again
            */
            //Check the user is not already in the room
            if (_.findWhere(room.users, {user_id: user.user_id})) {
                //User already exists in the room
                if (!after_login) {
                    return socket.emit(
                        'error',
                        {
                            reason: 'Room Join failed: You are already in that room!'
                        });
                }
            } else {
                //User doesnt exist in the room
                if (after_login) {
                    return;
                }
            }
            //Check the user has permission
            if (_.intersection(room.groups, user.groups).length === 0) {
                if (!after_login) {
                    socket.emit(
                        'error',
                        {
                            reason: 'Room Join failed: You do not have permission to join this room!'
                        });
                }
                return;
            }

            //Let the user know they have joined & the current state of the room
            socket.emit(
                'room_join',
                {
                    room_id: room.room_id,
                    name: room.name,
                    description: room.description,
                    users: _.pluck(room.users, 'username')
                });
            //Record that the user is in the room
            if (!after_login) {
                room.users.push(user);
            }
            //Let the room know that this user has joined
            post_message(
                room,
                'user_join',
                {
                    user_id: user.user_id,
                    username: user.username
                }
            );
            //Just to test sending messages...
            post_message(
                room,
                'room_message',
                {
                    username: 'SERVER',
                    msg: 'Say hello to ' + user.username
                }
            );
        };

        //Now let the client know they are logged in
        socket.emit('login');

        //Rejoin the rooms they were previously in
        _.forEach(rooms, function(room) {
            room_join(room, true);
        });
    };
    socket.on('login', login_listener);
});
