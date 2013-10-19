var _ = require('underscore'),
    express = require('express'),
    express = require('express'),
    fs = require('fs'),
    io = require('socket.io').listen(4000);

/**********************************\
*            RESTART
\**********************************/
function change_watch(path) {
    if (path.indexOf('/node_modules') !== -1) return;

    fs.readdir(path, function(err, files) {
        if (err) return console.log('Error listing files - ', err);
        //Watch the directory for any changes
        fs.watch(path, function file_change(event, filename) {
            console.log('Exiting from file '+event+'d event: '+path+'/'+filename);
            process.exit(1);
        });
        //Recurse through sub-directories to watch
        files.forEach(function(item) {
            var new_path = path + '/' + item;
            var stats = fs.statSync(new_path);
            if (stats.isDirectory()) {
                change_watch(new_path);
            }
        });
    });
}
change_watch(__dirname);

/**********************************\
*            EXPRESS
\**********************************/
var express_app = express();

express_app.configure(function() {
    express_app.use(express.bodyParser());
    express_app.use(express_app.router);
    express_app.use('/static', express.static('static'));
    express_app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
});

function serverFile(filename, res, encoding, content_type) {
    encoding = encoding || 'utf8';
    content_type = content_type || 'text/html';
    fs.readFile(filename, encoding, function(err, contents) {
        if (err)
            res.send({message: 'Unable to load HTML' , errors: err});
        else
            res.setHeader('Content-Type', content_type);
            res.end(contents, encoding);
    });
}

express_app.get('/', function(req, res) {
    serverFile(__dirname + '/ui/index.html', res);
});

express_app.listen(9000);
console.log('Listening on http://localhost:9000');

/**********************************\
*           SOCKET.IO
\**********************************/
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
        rooms: [],
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
        /**********************************\
        *   Check the login details
        \**********************************/
        console.log('socket.on:login');

        //Find the user by username
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

        //Check their password is correct
        if (user.password !== data.password) {
            console.log('Login fail - incorrect password!');
            return socket.emit(
                'error',
                {
                    reason: 'Login failed: Incorrect password!'
                });
        }
        console.log('Login success!');

        //If they're logged in somewhere else, log them out
        if (user.socket) {
            console.log('Disconnecting: ' + user.socket.id)
            user.socket.emit('disconnect');
        }

        //Save the new socket to the user
        user.socket = socket;
        console.log('Connected: ' + user.socket.id)

        //Login was successful; don't let them login again on the same WS!
        socket.removeListener('login', login_listener);

        /**********************************\
        *   Helper functions
        \**********************************/
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

        /**********************************\
        *   Socket functions
        \**********************************/
        //Now if the user disconnects, we might actually have to do something!
        socket.on('disconnect', function(data) {
            console.log('socket.on:disconnect');

            //If the users connection is current, remove it
            if (user.socket.id === socket.id) {
                user.socket = undefined;
            }

            //Remove them from all rooms & update other users
            user.rooms.forEach(function(room) {
                var room_user_index = room.users.indexOf(user);
                if (room_user_index === -1) {
                    console.log('Coulndt find user in room.users when room was in user.rooms!');
                    console.log('User: '+user.user_id+' ('+user.username+')');
                    console.log('Room: '+room.room_id+' ('+room.name+')');
                } else {
                    //Remove the user from the room
                    room.users.pop(room_user_index)

                    //Let all other users know
                    post_message(
                        room,
                        'user_leave',
                        {
                            user_id: user.user_id,
                            username: user.username
                        });
                }
            });
        });

        //Now add the functions which are available after login
        socket.on('user_add', function(data) {
            console.log('socket.on:user_add');
            //TODO
            console.log(data);
        });

        socket.on('user_remove', function(data) {
            console.log('socket.on:user_remove');
            //TODO
            console.log(data);
        });

        socket.on('user_message', function(data) {
            console.log('socket.on:user_message');
            //TODO
            console.log(data);
        });

        socket.on('user_list', function(data) {
            console.log('socket.on:user_list');
            //TODO
            console.log(data);
        });

        socket.on('room_add', function(data) {
            console.log('socket.on:room_add');
            //TODO
            console.log(data);
        });

        socket.on('room_remove', function(data) {
            console.log('socket.on:room_remove');
            //TODO
            console.log(data);
        });

        socket.on('room_message', function(data) {
            console.log('socket.on:room_message');
            //TODO
            console.log(data);
        });

        socket.on('room_list', function(data) {
            console.log('socket.on:room_list');
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
            console.log('socket.on:room_join');
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

        /**********************************\
        *   Login & setup complete
        \**********************************/
        //Now let the client know they are logged in
        socket.emit('login');

        //Rejoin the rooms they were previously in
        _.forEach(rooms, function(room) {
            room_join(room, true);
        });
    };
    socket.on('login', login_listener);
});

