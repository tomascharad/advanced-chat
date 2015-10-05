function Room(name, id, owner) {
  this.name = name;
  this.id = id;
  this.owner = owner;
  this.people = [];
  this.peopleLimit = 4;
  this.status = "available";
  this.private = false;
}

Room.prototype.addPerson = function(person) {
  if (this.status === "available") {
    this.people.push(person);
  }
};

Room.prototype.removePerson = function(person) {
  var personIndex = -1;
  for(var i = 0; i < this.people.length; i++){
    if(this.people[i].email === person.email){
      personIndex = i;
      break;
    }
  }
  this.people.remove(personIndex);
};

Room.prototype.getPerson = function(personEmail) {
  var person = null;
  for(var i = 0; i < this.people.length; i++) {
    if(this.people[i].email == personEmail) {
      person = this.people[i];
      break;
    }
  }
  return person;
};

Room.prototype.isAvailable = function() {
  return this.available === "available";
};

Room.prototype.isPrivate = function() {
  return this.private;
};

module.exports = Room;
