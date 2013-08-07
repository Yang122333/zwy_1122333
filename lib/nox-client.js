var modules = {};

function required_module(name, obj) {
    modules[name] = obj;
}

function require(name) {
    return modules[name];
}

