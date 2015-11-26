var express = require('express')
, app = express()
, server = require('http').createServer(app)
, io = require("socket.io").listen(server, {origins: '*:*'})
, npid = require("npid")
, uuid = require('node-uuid')
, Room = require('./room.js')
, _ = require('underscore')._;

var bodyParser = require('body-parser');
var methodOverride = require('method-override');

// TCT: Allow cros origin
app.use(function (req, res, next) {
  // Website you wish to allow to connect
  res.setHeader('Access-Control-Allow-Origin', '*');

  // Request methods you wish to allow
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');

  // Request headers you wish to allow
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type');

  // Set to true if you need the website to include cookies in the requests sent
  // to the API (e.g. in case you use sessions)
  res.setHeader('Access-Control-Allow-Credentials', true);

  // Pass to next layer of middleware
  next();
});

app.set('port', process.env.PORT || 3000);
// app.set('ipaddr', process.env.IP || "127.0.0.1");
app.use(bodyParser.json());
app.use(methodOverride());
app.use(express.static(__dirname + '/public'));
app.use('/components', express.static(__dirname + '/components'));
app.use('/js', express.static(__dirname + '/js'));
app.use('/icons', express.static(__dirname + '/icons'));
app.set('views', __dirname + '/views');
app.engine('html', require('ejs').renderFile);

/* Store process-id (as priviledged user) */
// try {
//     npid.create('/var/run/advanced-chat.pid', true);
// } catch (err) {
//     console.log(err);
//     //process.exit(1);
// }

app.get('/', function(req, res) {
  res.render('index.html');
});

server.listen(app.get('port'), app.get('ipaddr'), function(){
	console.log('Express server listening on  IP: ' + app.get('ipaddr') + ' and port ' + app.get('port'));
});

io.set("log level", 1);
var people = {};
var rooms = {};
var sockets = [];
var chatHistory = {};

function purge(s, action) {
	var person = getPersonBySocket(s);
	/*
	The action will determine how we deal with the room/user removal.
	These are the following scenarios:
	if the user is the owner and (s)he:
		1) disconnects (i.e. leaves the whole server)
			- advise users
		 	- delete user from people object
			- delete room from rooms object
			- delete chat history
			- remove all users from room that is owned by disconnecting user
		2) removes the room
			- same as above except except not removing user from the people object
		3) leaves the room
			- same as above
	if the user is not an owner and (s)he's in a room:
		1) disconnects
			- delete user from people object
			- remove user from room.people object
		2) removes the room
			- produce error message (only owners can remove rooms)
		3) leaves the room
			- same as point 1 except not removing user from the people object
	if the user is not an owner and not in a room:
		1) disconnects
			- same as above except not removing user from room.people object
		2) removes the room
			- produce error message (only owners can remove rooms)
		3) leaves the room
			- n/a
	*/
	if (person.inroom) { //user is in a room
		var room = rooms[person.inroom]; //check which room user is in.
		if (s.id === room.owner) { //user in room and owns room
			if (action === "disconnect") {
				io.sockets.in(s.room).emit("update", "The owner (" +person.name + ") has left the server. The room is removed and you have been disconnected from it as well.");
				var socketids = [];
				for (var i=0; i<sockets.length; i++) {
					socketids.push(sockets[i].id);
					if(_.contains((socketids)), room.people) {
						sockets[i].leave(room.name);
					}
				}

				if(_.contains((room.people)), s.id) {
					for (var i=0; i<room.people.length; i++) {
						getPersonBySocketId(room.people[i]).inroom = null;
					}
				}
				room.people = _.without(room.people, s.id); //remove people from the room:people{}collection
				delete rooms[person.owns]; //delete the room
				delete person; //delete user from people collection
				delete chatHistory[room.name]; //delete the chat history
				sizePeople = _.size(people);
				sizeRooms = _.size(rooms);
				io.sockets.emit("update-people", {people: people, count: sizePeople});
				io.sockets.emit("roomList", {rooms: rooms, count: sizeRooms});
				var o = _.findWhere(sockets, {'id': s.id});
				sockets = _.without(sockets, o);
			} else if (action === "removeRoom") { //room owner removes room
				io.sockets.in(s.room).emit("update", "The owner (" +person.name + ") has removed the room. The room is removed and you have been disconnected from it as well.");
				var socketids = [];
				for (var i=0; i<sockets.length; i++) {
					socketids.push(sockets[i].id);
					if(_.contains((socketids)), room.people) {
						sockets[i].leave(room.name);
					}
				}

				if(_.contains((room.people)), s.id) {
					for (var i=0; i<room.people.length; i++) {
						people[room.people[i]].inroom = null;
					}
				}
				delete rooms[people[s.id].owns];
				people[s.id].owns = null;
				room.people = _.without(room.people, s.id); //remove people from the room:people{}collection
				delete chatHistory[room.name]; //delete the chat history
				sizeRooms = _.size(rooms);
				io.sockets.emit("roomList", {rooms: rooms, count: sizeRooms});
			} else if (action === "leaveRoom") { //room owner leaves room
				io.sockets.in(s.room).emit("update", "The owner (" +person.name + ") has left the room. The room is removed and you have been disconnected from it as well.");
				var socketids = [];
				for (var i=0; i<sockets.length; i++) {
					socketids.push(sockets[i].id);
					if(_.contains((socketids)), room.people) {
						sockets[i].leave(room.name);
					}
				}

				if(_.contains((room.people)), s.id) {
					for (var i=0; i<room.people.length; i++) {
						people[room.people[i]].inroom = null;
					}
				}
				delete rooms[person.owns];
				person.owns = null;
				room.people = _.without(room.people, s.id); //remove people from the room:people{}collection
				delete chatHistory[room.name]; //delete the chat history
				sizeRooms = _.size(rooms);
				io.sockets.emit("roomList", {rooms: rooms, count: sizeRooms});
			}
		} else {//user in room but does not own room
			if (action === "disconnect") {
				io.sockets.emit("update", person.name + " has disconnected from the server.");
				if (_.contains((room.people), s.id)) {
					var personIndex = room.people.indexOf(s.id);
					room.people.splice(personIndex, 1);
					s.leave(room.name);
				}
				delete person;
				sizePeople = _.size(people);
				io.sockets.emit("update-people", {people: people, count: sizePeople});
				var o = _.findWhere(sockets, {'id': s.id});
				sockets = _.without(sockets, o);
			} else if (action === "removeRoom") {
				s.emit("update", "Only the owner can remove a room.");
			} else if (action === "leaveRoom") {
				if (_.contains((room.people), s.id)) {
					var personIndex = room.people.indexOf(s.id);
					room.people.splice(personIndex, 1);
					person.inroom = null;
					io.sockets.emit("update", person.name + " has left the room.");
					s.leave(room.name);
				}
			}
		}	
	} else {
		//The user isn't in a room, but maybe he just disconnected, handle the scenario:
		if (action === "disconnect") {
			io.sockets.emit("update", person.name + " has disconnected from the server.");
			delete person;
			sizePeople = _.size(people);
			io.sockets.emit("update-people", {people: people, count: sizePeople});
			var o = _.findWhere(sockets, {'id': s.id});
			sockets = _.without(sockets, o);
		}		
	}
}


io.sockets.on("connection", function (socket) {
	var person = getPersonBySocket(socket);

	socket.on("joinserver", function(email, name, device, companyCode) {
		var person = null;
		var ownerRoomID = inRoomID = null;

		person = findPersonByName(name);
		if (person) {//provide unique username:
			person.sockets.push(socket);
			socket.emit("exists", {msg: "The username already exists, you can still use this connection", proposedName: proposedName});
		} else {
			var joinedPerson = new Person(email, name, ownerRoomID, inRoomID, device, socket, companyCode);
			people.push(joinedPerson);
			socket.emit("update", "You have connected to the server.");
			var sameCompanyPersons = getSameCompanyPersons(joinedPerson);
			sameCompanyPersons.forEach(function(person) {
				person.socket.emit("update", email + " is online.");
				person.socket.emit("update-people", {people: sameCompanyPersons, count: sizePeople});
			});
			sizePeople = _.size(people);
			sizeRooms = _.size(rooms);
			socket.emit("roomList", {rooms: rooms, count: sizeRooms});
			socket.emit("joined"); //extra emit for GeoLocation
			sockets.push(socket);
		}
	});



	socket.on("getOnlinePeople", function(fn) {
    fn({people: people});
  });

	socket.on("countryUpdate", function(data) { //we know which country the user is from
		country = data.country.toLowerCase();
		person.country = country;
		io.sockets.emit("update-people", {people: people, count: sizePeople});
	});

	socket.on("typing", function(data) {
		if (typeof people[socket.id] !== "undefined")
			io.sockets.in(socket.room).emit("isTyping", {isTyping: data, person: person.name});
	});
	
	socket.on("send", function(msTime, msg, callback) {
		//process.exit(1);
		var re = /^[w]:.*:/;
		var whisper = re.test(msg);
		var whisperStr = msg.split(":");
		var found = false;
		if (whisper) {
			var whisperTo = whisperStr[1];
			var sockets = getAllPeopleSockets();
			if (sockets.length !== 0) {
				for (var i = 0; i<sockets.length; i++) {
					var whisperedPerson = getPersonBySocket(socket);
					if (whisperedPerson.email === whisperTo) {
						var whisperId = whisperedPerson.email;
						found = true;
						if (person.email === whisperedPerson.email) { //can't whisper to ourselves
							socket.emit("update", "You can't whisper to yourself.");
						} else {
							whisperTo = whisperStr[1];
							var whisperMsg = whisperStr[2];
							socket.emit("whisper", msTime, {name: "You"}, whisperMsg);
							io.sockets.connected[whisperId].emit("whisper", msTime, people[socket.id], whisperMsg);
							
							// TCT: Review following case
							if (io.sockets.manager.roomClients[socket.id]['/'+socket.room] !== undefined ) {
								io.sockets.in(socket.room).emit("chat", msTime, people[socket.id], msg);
								socket.emit("isTyping", false);
								if (_.size(chatHistory[socket.room]) > 10) {
									chatHistory[socket.room].splice(0,1);
								} else {
									chatHistory[socket.room].push(people[socket.id].name + ": " + msg);
								}
						  } else {
								socket.emit("update", "Please connect to a room.");
						  }
						}
					} else {
							socket.emit("update", "Can't find " + whisperTo);
						}
					}
				}
			}
		callback();
	});

	socket.on("disconnect", function() {
		if (typeof person !== "undefined") { //this handles the refresh of the name screen
			purge(socket, "disconnect");
		}
	});

	//Room functions
	socket.on("createRoom", function(name) {
		if (person.inroom) {
			socket.emit("update", "You are in a room. Please leave it first to create your own.");
		} else if (!person.owns) {
			var id = uuid.v4();
			var room = new Room(name, id, socket.id);
			rooms[id] = room;
			sizeRooms = _.size(rooms);
			io.sockets.emit("roomList", {rooms: rooms, count: sizeRooms});
			//add room to socket, and auto join the creator of the room
			socket.room = name;
			socket.join(socket.room);
			person.owns = id;
			person.inroom = id;
			// TCT: Check now for other functions of room since we changed socket.id for person
			room.addPerson(person);
			socket.emit("update", "Welcome to " + room.name + ".");
			socket.emit("sendRoomID", {id: id});
			chatHistory[socket.room] = [];
		} else {
			socket.emit("update", "You have already created a room.");
		}
	});

	socket.on("check", function(name, fn) {
		var match = false;
		_.find(rooms, function(key,value) {
			if (key.name === name) {
				return match = true;
			}
		});
		fn({result: match});
	});

	socket.on("removeRoom", function(id) {
		 var room = rooms[id];
		 if (socket.id === room.owner) {
			purge(socket, "removeRoom");
		} else {
			socket.emit("update", "Only the owner can remove a room.");
		}
	});

	socket.on("joinRoom", function(id) {
		if (typeof person !== "undefined") {
			var room = rooms[id];
			if (socket.id === room.owner) {
				socket.emit("update", "You are the owner of this room and you have already been joined.");
			} else {
				if (isSocketInRoom(room, socket)) {
					socket.emit("update", "You have already joined this room.");
				} else {
					if (person.inroom !== null) {
				    		socket.emit("update", "You are already in a room ("+rooms[person.inroom].name+"), please leave it first to join another room.");
				    	} else {
						room.addPerson(person);
						person.inroom = id;
						socket.room = room.name;
						socket.join(socket.room);
						user = person;
						io.sockets.in(socket.room).emit("update", user.name + " has connected to " + room.name + " room.");
						socket.emit("update", "Welcome to " + room.name + ".");
						socket.emit("sendRoomID", {id: id});
						var keys = _.keys(chatHistory);
						if (_.contains(keys, socket.room)) {
							socket.emit("history", chatHistory[socket.room]);
						}
					}
				}
			}
		} else {
			socket.emit("update", "Please enter a valid name first.");
		}
	});

	socket.on("leaveRoom", function(id) {
		var room = rooms[id];
		if (room)
			purge(socket, "leaveRoom");
	});
});

function findPersonByName(name) {
	var person = _.find(people, function(key,value) {
		return key.name.toLowerCase() === name.toLowerCase();
	});
	return person;
}

function getPersonBySocket (socket) {
	return getPersonBySocketId(socket.id);
}

function getPersonBySocketId (socketId) {
	var person = _.find(people, function(person) {
		var seekedSocket = person.sockets.forEach(function (personSocket) {
			return personSocket.id === socketId;
		});
		// TCT: This is the same as returning socketFound (true) in case is found
		return seekedSocket;
	});
	return person;
}

function Person (email, name, ownerRoomID, inRoomID, device, socket, companyCode) {
	var person = this;
	person.email = email;
	person.name = name;
	person.ownerRoomID = ownerRoomID;
	person.inRoomID = inRoomID;
	person.device = device;
	person.sockets = [socket];
	person.companyCode = companyCode;
	return person;
}

function isSocketInRoom (room, socket) {
	var socketInRoom = false;
	room.people.forEach(function(person) {
		person.sockets.forEach(function(sckt) {
			if(sckt.id === socket.id) {
				socketInRoom = true;
			}
		});
	});
	return socketInRoom;
}

function getAllPeopleSockets () {
	var sockets = [];
	people.forEach(function(person) {
		person.sockets.forEach(function(socket) {
			sockets.push(socket);
		});
	});
	return sockets;
}

function getSameCompanyPersons (requestedCompanyPerson) {
	return people.filter(function(person) {return person.companyCode === requestedCompanyPerson.companyCode;});
}