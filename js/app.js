var app = angular.module('hometeaching', []);
var atag;

app.run(function($templateCache, Store) {
  var tags = document.getElementsByTagName('template');
  for (var i=0; i < tags.length; i++) {
    var tag = tags[i];
    $templateCache.put(tag.getAttribute('name')+'.html', tag.innerHTML);
  }

  Store.load();
})

app.config(function($routeProvider, $locationProvider) {
  $locationProvider.html5Mode(false).hashPrefix('');

  $routeProvider
    .when('/list', {
      templateUrl: 'listTemplate.html',
      controller: 'ListCtrl',
    })
    .when('/', {
      templateUrl: 'organizeTemplate.html',
      controller: 'OrganizeCtrl',
    })
    .otherwise({
      redirectTo: '/'
    });
});

app.filter('unassigned', function() {
  return function(items) {
    var ret = {};
    for (k in items) {
      if (items[k].companionship == null && items[k].included) {
        ret[k] = items[k];
      }
    }
    return ret;
  };
});

app.filter('notincluded', function() {
  return function(items) {
    var ret = {};
    for (k in items) {
      if (!items[k].included) {
        ret[k] = items[k];
      }
    }
    return ret;
  }
})

app.factory('Store', function() {
  this.state = {
    teachers: {},
    companionships: {},
    districts: {},
    families: {},
    changes: {},
    lastid: 1
  };
  this.save = function() {
    localStorage['state'] = JSON.stringify(this.state);
  };
  this.load = function() {
    if (localStorage['state'] != undefined) {
      var loaded = JSON.parse(localStorage['state']);
      for (k in loaded) {
        this.state[k] = loaded[k];
      }
    }
  };
  this.nextId = function() {
    this.state.lastid += 1;
    return this.state.lastid;
  }
  return this;
});


app.directive('navbar', function() {
  return {
    restrict: 'E',
    templateUrl: 'navbar.html',
    controller: function($scope, $location) {
      $scope.nav = function(where) {
        $location.path(where);
      }
    }
  }
});

app.controller('MainCtrl', function($scope, $location) {
  //$location.path('/list');
});


app.factory('LDSorg', function($http) {
  this.request = function() {
    $http.get('https://www.lds.org/directory/services/ludrs/unit/current-user-ward-stake/').then(function(x) {
      console.log(x);
    })
    console.log('req');
  };
  return this;
})


app.controller('ListCtrl', function($scope, $location, Store, LDSorg) {
  $scope.teachers = Store.state.teachers;
  $scope.families = Store.state.families;
  $scope.teacher_list = '';
  $scope.family_list = '';

  $scope.updateTeachers = function() {
    var teachers = $scope.teacher_list.split('\n');
    teachers.map(function(name) {
      var teacher = {
        id: Store.nextId(),
        name: name,
        companionship: null,
        included: true
      };
      $scope.teachers[teacher.id] = teacher;
    });
    Store.save();
  }

  $scope.updateFamilies = function() {
    var families = $scope.family_list.split('\n');
    families.map(function(name) {
      var family = {
        id: Store.nextId(),
        name: name,
        companionship: null,
        included: true
      };
      $scope.families[family.id] = family;
    });
    Store.save();
  }

  $scope.doStuff = function() {
    LDSorg.request();
  }
});

app.filter('niceChange', function(Store) {
  var state = Store.state;
  return function(x) {
    var obj;
    if (x.kind == 'family') {
      obj = state.families[x.id];
    } else if (x.kind == 'teacher') {
      obj = state.teachers[x.id];
    } else {
      return '?';
    }
    if (x.attr == 'companionship') {
      if (x.newval ==  null) {
        return obj.name + ' is no longer assigned.';
      } else {
        var companionship = state.companionships[x.newval];
        if (x.kind == 'family') {
          var teachers = [];
          for (id in companionship.teachers) {
            teachers.push(state.teachers[id].name);
          }
          teachers = teachers.join(' and ');
          if (!teachers.length) {
            teachers = 'nobody';
          }
          return obj.name + ' is now being taught by ' + teachers;
        } else if (x.kind == 'teacher') {
          var companions = [];
          for (id in companionship.teachers) {
            if (id != x.id) {
              companions.push(state.teachers[id].name);
            }
          }
          companions = companions.join(' and ');
          if (!companions.length) {
            companions = 'nobody';
          }
          return obj.name + ' is now companions with ' + companions;
        }
      }
    }
    return '';
  };
})

app.factory('Organizer', function(Store) {
  this.recordChange = function(kind, id, attr, oldval, newval) {
    var key = kind + '.' + id + '.' + attr;
    if (Store.state.changes[key]) {
      // modify existing change
      var x = Store.state.changes[key];
      x.newval = newval;
      if (x.newval == x.oldval) {
        delete Store.state.changes[key];
      }
    } else {
      // add new change
      Store.state.changes[key] = {
        kind: kind,
        id: id,
        attr: attr,
        oldval: oldval,
        newval: newval
      };
    }
  };

  this.clearChanges = function() {
    var keys = Object.keys(Store.state.changes);
    keys.forEach(function(x) {
      delete Store.state.changes[x];
    });
  };

  this.assignTogether = function(staying, moving) {
    var companionship;

    if (staying.companionship == null) {
      // making a new companionship
      companionship = this.createCompanionship();
      this.addCompanion(companionship, staying);
    } else {
      // use old companionship
      companionship = Store.state.companionships[staying.companionship];
    }
    this.addCompanion(companionship, moving);
  }

  this.unassignFamily = function(family) {
    if (family.companionship) {
      // remove existing assignment
      var old_companionship = Store.state.companionships[family.companionship];
      delete old_companionship.families[family.id];
      this.maybeDeleteCompanionship(old_companionship);
      family.companionship = null;
      this.recordChange('family', family.id, 'companionship',
                        old_companionship.id, null);
    }
    family.included = true;
    Store.save();
  }

  this.unassignTeacher = function(teacher) {
    if (teacher.companionship) {
      // remove existing assignment
      var old_companionship = Store.state.companionships[teacher.companionship];
      delete old_companionship.teachers[teacher.id];
      this.maybeDeleteCompanionship(old_companionship);
      teacher.companionship = null;
      this.recordChange('teacher', teacher.id, 'companionship',
                        old_companionship.id, null);
    }
    teacher.included = true;
    Store.save();
  }

  this.excludeFamily = function(family) {
    this.unassignFamily(family);
    if (family.included) {
      family.included = false;
    }
    Store.save();
  }

  this.excludeTeacher = function(teacher) {
    this.unassignTeacher(teacher);
    if (teacher.included) {
      teacher.included = false;
    }
    Store.save();
  }

  this.addCompanion = function(companionship, teacher) {
    this.unassignTeacher(teacher);

    teacher.companionship = companionship.id;
    companionship.teachers[teacher.id] = true;
    this.recordChange('teacher', teacher.id, 'companionship', null,
                      companionship.id);
    if (!teacher.included) {
      teacher.included = true;
    }
    Store.save();
  }

  this.createCompanionship = function() {
    var companionship = {
      id: Store.nextId(),
      teachers: {},
      families: {},
      district: null
    };
    Store.state.companionships[companionship.id] = companionship;
    return companionship;
  }

  this.maybeDeleteCompanionship = function(companionship) {
    if (Object.keys(companionship.teachers).length == 0 &&
        Object.keys(companionship.families).length == 0) {
      delete Store.state.companionships[companionship.id];
      Store.save();
    }
  }

  this.addFamily = function(companionship, family) {
    this.unassignFamily(family);

    family.companionship = companionship.id;
    companionship.families[family.id] = true;
    this.recordChange('family', family.id, 'companionship',
                      null, companionship.id);
    if (!family.included) {
      family.included = true;
    }
    Store.save();
  }

  this.addFamilyToTeacher = function(family, teacher) {
    var companionship;
    if (teacher.companionship == null) {
      var companionship = this.createCompanionship();
      this.addCompanion(companionship, teacher);
    } else {
      companionship = Store.state.companionships[teacher.companionship];

    }
    this.addFamily(companionship, family);
  }
  return this;
});


app.directive('teacher', function(Store, Organizer) {
  return {
    restrict: 'E',
    template: '<div class="teacher" draggable droppable="receiveDrop" data-kind="teacher" data-id="{{ teacher.id }}">{{ teacher.name }}</div>',
    scope: {
      teacher: '=obj'
    },
    controller: function($scope) {
      $scope.receiveDrop = function(kind, id) {
        if (kind == 'teacher') {
          Organizer.assignTogether($scope.teacher, Store.state.teachers[id]);
        } else if (kind == 'family') {
          Organizer.addFamilyToTeacher(Store.state.families[id], $scope.teacher);
        } else {
          console.log("I don't know what to do with that");
        }
      }
    }
  }
});

app.directive('family', function(Store, Organizer) {
  return {
    restrict: 'E',
    template: '<div class="family" draggable data-kind="family" data-id="{{ fam.id }}">{{ fam.name }}' +
      '</div>',
    scope: {
      fam: '='
    },
    controller: function($scope) {
      $scope.show_details = false;
      $scope.selectMe = function() {
        $scope.show_details = true;
      }
    }
  }
});

app.directive('companionship', function(Store, Organizer) {
  return {
    restrict: 'E',
    template: '<div class="companionship" ng-class="{\'need-companion\': needCompanion(), \'extra-companion\': extraCompanion(), \'need-family\': needFamily()}" droppable="receiveDrop">' +
        '<teacher obj="teacher" ng-repeat="teacher in teachers"></teacher>' +
        '<family fam="fam" ng-repeat="fam in families"></family>' +
      '</div>',
    scope: {
      comp: '='
    },
    controller: function($scope) {
      $scope.teachers = {}
      $scope.families = {}

      $scope.$watch('comp.teachers', function() {
        $scope.teachers = {};
        for (id in $scope.comp.teachers) {
          $scope.teachers[id] = Store.state.teachers[id];
        }
      }, true);

      $scope.$watch('comp.families', function() {
        $scope.families = {};
        for (id in $scope.comp.families) {
          $scope.families[id] = Store.state.families[id];
        }
      }, true);

      $scope.needCompanion = function() {
        return Object.keys($scope.teachers).length < 2;
      }
      $scope.extraCompanion = function() {
        return Object.keys($scope.teachers).length > 2;
      }
      $scope.needFamily = function() {
        return Object.keys($scope.families).length == 0;
      }

      $scope.receiveDrop = function(kind, id) {
        if (kind == 'teacher') {
          var teacher = Store.state.teachers[id];
          Organizer.addCompanion($scope.comp, teacher);
        } else if (kind == 'family') {
          Organizer.addFamily($scope.comp, Store.state.families[id]);
        } else {
          console.log('I dont know what to do with that')
        }
      }
    }
  }
});

app.directive('draggable', function() {
  return {
    restrict: 'A',
    link: function(scope, element, attrs) {
      element.draggable({
        revert: true,
        zIndex: 100,
      });
    }
  }
});

app.directive('droppable', function() {
  return {
    restrict: 'A',
    link: function(scope, element, attrs) {
      $(element).droppable({
        drop: function(event, ui) {
          var id = $(ui.draggable).attr('data-id');
          var kind = $(ui.draggable).attr('data-kind');
          var func = scope[attrs.droppable];
          func(kind, id);
          scope.$apply();
        },
        hoverClass: 'drop-hover'
      });
    }
  }
});

app.controller('OrganizeCtrl', function($scope, Store, Organizer) {
  $scope.teachers = Store.state.teachers;
  $scope.families = Store.state.families;
  $scope.companionships = Store.state.companionships;
  $scope.changes = Store.state.changes;

  $scope.unassign = function(kind, id) {
    if (kind == 'family') {
      var family = $scope.families[id];
      Organizer.unassignFamily(family);
    } else if (kind == 'teacher') {
      var teacher = $scope.teachers[id];
      Organizer.unassignTeacher(teacher);
    }
  }

  $scope.exclude = function(kind, id) {
    if (kind == 'family') {
      var family = $scope.families[id];
      Organizer.excludeFamily(family);
    } else if (kind == 'teacher') {
      var teacher = $scope.teachers[id];
      Organizer.excludeTeacher(teacher);
    } 
  }

  $scope.clearChanges = function() {
    Organizer.clearChanges();
  }

});