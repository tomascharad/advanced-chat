'use strict';
let express = require('express');
let app = express();
let server = require('http').createServer(app);
let io = require('socket.io').listen(server, {origins: '*:*'});
let deepcopy = require('deepcopy');
// let npid = require('npid');
// let uuid = require('node-uuid');
// let Room = require('./room.js');
let _ = require('underscore')._;


let bodyParser = require('body-parser');
let methodOverride = require('method-override');

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
// app.set('ipaddr', process.env.IP || '127.0.0.1');
app.use(bodyParser.json());
app.use(methodOverride());
app.use(express.static(__dirname + '/public'));
app.use('/components', express.static(__dirname + '/components'));
app.use('/js', express.static(__dirname + '/js'));
app.use('/icons', express.static(__dirname + '/icons'));
app.set('views', __dirname + '/views');
app.engine('html', require('ejs').renderFile);
app.get('/', function(req, res) {
  res.render('index.html');
});

server.listen(app.get('port'), app.get('ipaddr'), function(){
  console.log('Express server listening on  IP: ' + app.get('ipaddr') + ' and port ' + app.get('port'));
});

io.set('log level', 1);
let people = [];
let rooms = {};
let sockets = [];
let chatHistory = {};

function findPersonByName(name) {
  let person = _.find(people, function(person) {
    return person.name.toLowerCase() === name.toLowerCase();
  });
  return person;
}

function findPersonByEmail(personEmail) {
  let person = _.find(people, function(person) {
    return person.email.toLowerCase() === personEmail.toLowerCase();
  });
  return person;
}

function getPeopleForSocketObject(originalPeople) {
  let sameCompanyPeopleCopy = deepcopy(originalPeople);

  // TCT: Below line is made since socket.io has a bug in which circular reference in objets throws an error of maximum call stack is exceded
  sameCompanyPeopleCopy.forEach(function(sameCompanyPersonCopy){
    delete sameCompanyPersonCopy.sockets;
  });
  return sameCompanyPeopleCopy;
}
function getPersonForSocketObject (_person) {
  let person = deepcopy(_person);
  delete person.sockets;
  return person;
}

function removePerson(person) {
  let index = people.indexOf(person);
  if (index > -1) {
     people.splice(index, 1);
  }
}

function removeSocketFromPerson(person, socket) {
  let index = person.sockets.indexOf(socket);
  if (index > -1) {
     person.sockets.splice(index, 1);
  }
}

function getPersonBySocketId (socketId) {
  let person = people.find(function(person) {
    let seekedSocket = person.sockets.find(function (personSocket) {
      console.log(personSocket.id);
      console.log(socketId);
      return personSocket.id === socketId;
    });
    // TCT: This is the same as returning socketFound (true) in case is found
    return seekedSocket;
  });
  return person;
}

function getPersonBySocket (socket) {
  return getPersonBySocketId(socket.id);
}

class Person {
  constructor(email, name, device, socket, companyCode) {
    this.email = email;
    this.name = name;
    this.device = device;
    this.sockets = [socket];
    this.companyCode = companyCode;
  }
}

function getAllPeopleSockets () {
  let sockets = [];
  people.forEach(function(person) {
    person.sockets.forEach(function(socket) {
      sockets.push(socket);
    });
  });
  return sockets;
}

function getSameCompanyPeople (requestedCompanyPerson) {
  return people.filter(function(person) {return person.companyCode === requestedCompanyPerson.companyCode;});
}

function purge(person, socket) {
  // TCT: REFACTORED (Vastly deleted code) Removes person from people array
  io.sockets.emit('update', person.name + ' has disconnected from the server.');
  if (person.sockets.length > 1) {
    removeSocketFromPerson(person, socket);
    console.log('removing Socket to person');
    console.log('remainding sockets: ' + person.sockets.length);
  } else {
    console.log('removing person');
    removePerson(person);
  }
  let sizePeople = _.size(people);
  let peopleForSocketObject = getPeopleForSocketObject(people);
  io.sockets.emit('update-people', {people: peopleForSocketObject, count: sizePeople});
  let o = _.findWhere(sockets, {'id': socket.id});
  sockets = _.without(sockets, o);
}


io.sockets.on('connection', function (socket) {
  let joinedPerson = {};

  socket.on('joinserver', function(email, name, device, companyCode) {
    joinedPerson = findPersonByName(name);
    if (joinedPerson) {//provide unique username:
      console.log('Adding socket to person');
      joinedPerson.sockets.push(socket);
    } else {
      console.log('Creating person');
      joinedPerson = new Person(email, name, device, socket, companyCode);
      people.push(joinedPerson);
      socket.emit('update', 'You have connected to the server.');
      let sameCompanyPeople = getSameCompanyPeople(joinedPerson);
      // TCT: Below line is made since socket.io has a bug in which circular reference in objets throws an error of maximum call stack is exceded
      let peopleForSocketObject = getPeopleForSocketObject(sameCompanyPeople);
      let sizePeople = _.size(people);
      let sizeRooms = _.size(rooms);
      console.log(joinedPerson);
      sameCompanyPeople.forEach(function(person) {
        person.sockets.forEach(function(socket) {
          socket.emit('update', email + ' is online.');
          socket.emit('update-people', {people: peopleForSocketObject, count: sizePeople});
          socket.emit('roomList', {rooms: rooms, count: sizeRooms});
          socket.emit('joined'); //extra emit for GeoLocation
        });
      });
    }
  });

  socket.on('getOnlinePeople', function(fn) {
    let peopleForSocketObject = getPeopleForSocketObject(people);
    fn({people: peopleForSocketObject});
  });

  socket.on('countryUpdate', function(data) { //we know which country the user is from
    let country = data.country.toLowerCase();
    joinedPerson.country = country;
    let peopleForSocketObject = getPeopleForSocketObject(people);
    io.sockets.emit('update-people', {people: peopleForSocketObject, count: _.size(people)});
  });

  socket.on('typing', function(data) {
    // TCT: This will crash since we are changing people object to an array
    if (typeof people[socket.id] !== 'undefined') {
      io.sockets.in(socket.room).emit('isTyping', {isTyping: data, person: joinedPerson.name});
    }
  });
  
  socket.on('send', function(msTime, msg, callback) {

    //process.exit(1);
    let re = /^[w]:.*:/;
    let whisper = re.test(msg);
    let whisperStr = msg.split(':');
    if (whisper) {
      let personEmail = whisperStr[1];
      let message = whisperStr[2];
      let personToSendMessage = findPersonByEmail(personEmail);
      let personForSocketObject = getPersonForSocketObject(getPersonBySocket(socket));
      personToSendMessage.sockets.forEach(function(socket) {
        socket.emit('whisper', msTime, personForSocketObject, message);
      });
    }
    callback();
  });

  socket.on('disconnect', function() {
    // TCT: This checks that the person has any sockets registered
    let person = getPersonBySocket(socket);
    if (joinedPerson && person) { //this handles the refresh of the name screen
      purge(person, socket);
    }
  });
});