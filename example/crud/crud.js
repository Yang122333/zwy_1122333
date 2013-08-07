var Datastore = require('nedb');
var db = new Datastore();

exports.create = function(name, callback) {
    db.insert({name: name}, callback);
}

exports.update = function(id, newname, callback) {
    db.update({ _id: id }, { $set: { name: newname } }, callback);
}

exports.remove = function(id, callback) {
    db.remove({ _id: id }, {}, callback);
}

exports.list = function(callback) {
    db.find({}, callback);
}



