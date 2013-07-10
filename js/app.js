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
    .when('/people', {
      templateUrl: 'listTemplate.html',
      controller: 'ListCtrl',
    })
    .when('/organize', {
      templateUrl: 'organizeTemplate.html',
      controller: 'OrganizeCtrl',
    })
    .when('/data', {
      templateUrl: 'dataTemplate.html',
      controller: 'DataCtrl',
    })
    .when('/debug', {
      templateUrl: 'debugTemplate.html',
      controller: 'DebugCtrl',
    })
    .when('/groups', {
      templateUrl: 'groupTemplate.html',
      controller: 'GroupCtrl',
    })
    .otherwise({
      redirectTo: '/people'
    });
});

app.filter('toArray', function() {
  return function(obj) {
    var ret = [];
    for (k in obj) {
      ret.push(obj[k]);
    };
    return ret;
  }
});

app.filter('unassigned', function() {
  return function(items) {
    return items.filter(function(item) {
      return item.companionship == null && item.other_group == null;
    });
  };
});

app.filter('inGroup', function() {
  return function(items, group) {
    return items.filter(function(item) {
      return item.other_group == group;
    })
  }
});

app.filter('filterCompanionships', function($filter, Store) {
  function lookupArray(obj, data_src) {
    var ret = [];
    for (k in obj) {
      ret.push(data_src[k]);
    }
    return ret;
  }
  return function(items, text) {
    return items.filter(function(item) {
      if (item == undefined) {
        return false;
      }
      var matching_families = $filter('filter')(
        lookupArray(item.families, Store.state.families), text);
      if (matching_families.length) {
        return true;
      }
      var matching_teachers = $filter('filter')(
        lookupArray(item.teachers, Store.state.teachers), text);
      return matching_teachers.length;
    })
  }
})

app.filter('nodistrict', function() {
  return function(items) {
    return items.filter(function(item) {
      return item.district == null;
    });
  };
});

app.factory('Store', function() {
  this.state = {
    teachers: {},
    companionships: {},
    districts: {},
    families: {},
    changes: {},
    groups: ['other quorum', 'not now', null],
    teacher_groups: {},
    possible_groups: [
      {id: 'HIGH_PRIEST', name:'High Priest'},
      {id: 'ELDER', name: 'Elders'},
      {id: 'PRIEST', name: 'Priest'},
      {id: 'TEACHER', name: 'Teacher'},
      {id: 'DEACON', name: 'Deacon'},
    ],
    lds: {
      wardUnitNo: null,
    },
    lastid: 1
  };
  this.trans = {
    selected_thing: null,
    photos: {}
  };
  this.save = function() {
    localStorage['state'] = angular.toJson(this.state);
  };
  this.load = function() {
    if (localStorage['state'] != undefined) {
      var loaded = angular.fromJson(localStorage['state']);
      angular.copy(loaded, this.state);
    }
  };
  this.nextId = function() {
    this.state.lastid += 1;
    return 'X.' + this.state.lastid;
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


app.factory('LDSorg', function($http, $q, Store) {
  this.getWardUnitNo = function() {
    if (Store.state.lds.wardUnitNo) {
      var d = $q.defer();
      d.resolve(Store.state.lds.wardUnitNo);
      return d.promise;
    }
    return $http.get('https://www.lds.org/directory/services/ludrs/unit/current-user-ward-stake/')
      .then(function(x) {
        Store.state.lds.wardUnitNo = x.data.wardUnitNo;
        Store.save();
      }.bind(this), function(err) {
        alert('You need to log in to lds.org');
      });
  }
  this.fetchFamilies = function() {
    return this.getWardUnitNo().then(function() {
      return $http.get('https://www.lds.org/directory/services/ludrs/mem/member-list/' + Store.state.lds.wardUnitNo)
        .then(function(x) {
          return x.data;
        }.bind(this), function(err) {
          alert('You need to log in to lds.org');
          throw err;
        });
    }.bind(this));
  };
  this._fetchOrganization = function(name) {
    return $http.get('https://www.lds.org/directory/services/ludrs/1.1/unit/roster/' + Store.state.lds.wardUnitNo + '/' + name)
        .then(function(response) {
          return response.data;
        }, function(err) {
          alert('You need to log in to lds.org');
          throw err;
        });
  }
  this.fetchOrganizations = function(names) {
    if (names.length == 0) {
      var d = $q.defer();
      d.resolve([]);
      return d.promise;
    }
    var name = names.shift();
    return this._fetchOrganization(name)
      .then(function(data) {
        return this.fetchOrganizations(names)
          .then(function(other) {
            return data.concat(other);
          }.bind(this));
      }.bind(this));
  }


  this.loadPhotos = function(ids) {
    ids = angular.copy(ids);
    
    function getSet() {
      var set = [];
      while (ids.length && set.length < 20) {
        // don't fetch if we already have it
        var id = ids.shift();
        if (Store.trans.photos[id]) {
          // we already have it
        } else {
          set.push(id);
        }
      }
      return set;
    }

    // from http://stackoverflow.com/questions/934012/get-image-data-in-javascript
    function getBase64Image(img) {
      // Create an empty canvas element
      var canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;

      // Copy the image contents to the canvas
      var ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);

      var dataURL = canvas.toDataURL("image/png");
      return dataURL;
      //return dataURL.replace(/^data:image\/(png|jpg);base64,/, "");
    }
    
    var set = getSet();
    if (!set.length) {
      var d = $q.defer();
      d.resolve(null);
      return d.promise;
    }
    return $http.get('https://www.lds.org/directory/services/ludrs/photo/url/'+set.join(',')+'/individual')
      .then(function(x) {
        if (Object.prototype.toString.call(x.data) !== '[object Array]') {
          x.data = [x.data];
        }
        x.data.forEach(function(x) {
          var img = new Image();
          img.onload = function() {
            b64 = getBase64Image(img);
            Store.trans.photos[x.individualId] = b64;
          };
          img.src = 'https://www.lds.org' + x.mediumUri;
          // Store.trans.photos[x.individualId] = {
          //   large: x.largeUri,
          //   medium: x.mediumUri,
          //   original: x.originalUri,
          //   thumbnail: x.thumbnailUri,
          // }
        }.bind(this))
        return this.loadPhotos(ids);
      }.bind(this),
      function(err) {
        alert('You must be logged in to lds.org for this to work');
        throw err;
      });
  }
  return this;
})


app.controller('ListCtrl', function($scope, $location, Store, LDSorg, Organizer) {
  $scope.teachers = Store.state.teachers;
  $scope.families = Store.state.families;
  $scope.teacher_list = '';
  $scope.family_list = '';
  $scope.teacher_groups = Store.state.teacher_groups;
  $scope.possible_groups = Store.state.possible_groups;
  $scope.lds = Store.state.lds;
  $scope.trans = Store.trans;
  $scope.loading = 0;

  $scope.toggleGroup = function(group) {
    if ($scope.teacher_groups[group.id]) {
      delete $scope.teacher_groups[group.id];
    } else {
      $scope.teacher_groups[group.id] = group.id;
    }
    Store.save();
  }

  $scope.usingGroup = function(group) {
    if ($scope.teacher_groups[group.id] == undefined) {
      return false;
    } else {
      return true;
    }
  }

  $scope.refreshFamilyList = function() {
    $scope.loading += 1;
    LDSorg.fetchFamilies().then(function(x) {
      var existing = Object.keys($scope.families).filter(function(x) {
        // exclude hand-added ones
        return x.substr(0,2) != 'X.';
      });
      x.forEach(function(household) {
        var id = '' + household.headOfHouseIndividualId;
        if (existing.indexOf(id) != -1) {
          existing.splice(existing.indexOf(id), 1);
        }
        if ($scope.families[id]) {
          // already exists
          $scope.families[id][name] = household.coupleName;
        } else {
          // new record
          $scope.families[id] = {
            id: id,
            name: household.coupleName,
            companionship: null,
            other_group: null,
          };
        }
      });
      // remove ids not encountered
      existing.forEach(function(id) {
        Organizer.familyMoved($scope.families[id]);
      });
      Store.save();
    }).then(function() {
      $scope.loading -= 1;
    }, function() {
      $scope.loading -= 1;
    })
  }

  $scope.refreshTeacherList = function() {
    $scope.loading += 1;
    var teacher_groups = Object.keys($scope.teacher_groups);
    LDSorg.fetchOrganizations(teacher_groups).then(function(x) {
      x.forEach(function(item) {
        Organizer.addTeacher(item.preferredName, item.individualId);
      })
      Store.save();
    }).then(function() {
      $scope.loading -= 1;
    }, function() {
      $scope.loading -= 1;
    })
  }

  $scope.imageSrc = function(lds_id) {
    var item = Store.state.lds.photoURLs[lds_id];
    if (item === undefined) {
      return '';
    } else {
      return 'https://www.lds.org' + item.medium;
    }
  }
  $scope.toggleFamilyInclusion = function(family) {
    if (family.other_group == null) {
      Organizer.excludeFamily(family, 'other quorum');
    } else {
      family.other_group = null;
      Store.save();
    }
  };

  $scope.toggleTeacherInclusion = function(teacher) {
    if (teacher.other_group == null) {
      Organizer.excludeTeacher(teacher, 'other quorum');
    } else {
      teacher.other_group = null;
      Store.save();
    }
  };
});

app.controller('DataCtrl', function($scope, $filter, Store) {
  $scope.dataURI = '';
  $scope.filename = '';
  $scope.state = Store.state;

  $scope.$watch('state', function() {
    // filename
    var d = new Date();
    d = $filter('date')(d, 'yyyyMMdd.HHmm');
    $scope.filename = 'ht.' + d + '.json';

    // file content
    var blob = new Blob([angular.toJson(Store.state)], {type:'application/json'});
    $scope.dataURI = window.webkitURL.createObjectURL(blob);
  }, true);

  $scope.loadFile = function(file_el) {
    var files = document.getElementById(file_el).files;
    var file = files[0];

    var reader = new FileReader();
    reader.onload = function(x) {
      var data = angular.fromJson(reader.result);
      angular.extend(Store.state, data);
      Store.save();
      window.location.reload();
    };
    reader.readAsText(file);
  }
})

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
          try {
            for (id in companionship.teachers) {
              teachers.push(state.teachers[id].name);
            }
          } catch(err) {
            console.log('no companionship A:' + x.newval);
            console.log(obj.name);
          }
          teachers = teachers.join(' and ');
          if (!teachers.length) {
            teachers = 'nobody';
          }
          return obj.name + ' is now being taught by ' + teachers;
        } else if (x.kind == 'teacher') {
          var companions = [];
          try {
            for (id in companionship.teachers) {
              if (id != x.id) {
                companions.push(state.teachers[id].name);
              }
            }
          } catch(err) {
            console.log('no companionship B:' + x.newval)
            console.log(obj.name);
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

  this.fixOrphans = function() {
    // I don't know the bug that causes me to need this
    // companionships
    angular.forEach(Store.state.companionships, function(companionship) {
      this.maybeDeleteCompanionship(companionship);
    }.bind(this));

    // teachers
    angular.forEach(Store.state.teachers, function(teacher) {
      if (teacher.companionship != null
          && !Store.state.companionships[teacher.companionship]) {
        this.unassignTeacher(teacher);
      }
    }.bind(this));

    // families
    angular.forEach(Store.state.families, function(family) {
      if (family.companionship != null
          && !Store.state.companionships[family.companionship]) {
        this.unassignFamily(family);
      }
    }.bind(this))
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
    family.other_group = null;
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
    teacher.other_group = null;
    Store.save();
  }

  // remove a family from the ward
  this.familyMoved = function(family) {
    this.unassignFamily(family);
    delete Store.state.families[family.id];
    Store.save();
  }

  // remove a teacher from the ward
  this.teacherMoved = function(teacher) {
    this.unassignTeacher(teacher);
    delete Store.state.teachers[teacher.id];
    Store.save();
  }

  this.addTeacher = function(name, id) {
    if (id === null || id === undefined) {
      id = Store.nextId();
    }
    id = '' + id;
    if (Store.state.teachers[id]) {
      // existing
      Store.state.teachers[id].name = name;
    } else {
      // new
      Store.state.teachers[id] = {
        id: id,
        name: name,
        companionship: null,
        other_group: null
      };
    }
  }

  this.excludeFamily = function(family, group) {
    if (group == null || group === undefined) {
      group = 'excluded';
    }
    this.unassignFamily(family);
    family.other_group = group;
    Store.save();
  }

  this.excludeTeacher = function(teacher, group) {
    if (group == null || group === undefined) {
      group = 'excluded';
    }
    this.unassignTeacher(teacher);
    teacher.other_group = 'excluded';
    Store.save();
  }

  this.addCompanion = function(companionship, teacher) {
    if (companionship.id === teacher.companionship) {
      // no change
      return;
    }
    this.unassignTeacher(teacher);

    teacher.companionship = companionship.id;
    companionship.teachers[teacher.id] = true;
    this.recordChange('teacher', teacher.id, 'companionship', null,
                      companionship.id);
    teacher.other_group = null;
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
    if (family.companionship == companionship.id) {
      // no change
      return;
    }
    this.unassignFamily(family);

    family.companionship = companionship.id;
    companionship.families[family.id] = true;
    this.recordChange('family', family.id, 'companionship',
                      null, companionship.id);
    family.other_group = null;
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

  this.createDistrict = function() {
    var district = {
      id: Store.nextId(),
      companionships: {},
      leader: null,
      name: null
    }
    Store.state.districts[district.id] = district;
    Store.save();
    return district;
  };

  this.unassignDistrict = function(companionship) {
    if (companionship.district) {
      var old_district = Store.state.districts[companionship.district];
      delete old_district.companionships[companionship.id];
    }
    companionship.district = null;
    Store.save();
  }

  this.assignToDistrict = function(companionship, district) {
    this.unassignDistrict(companionship);

    companionship.district = district.id;
    district.companionships[companionship.id] = true;
    Store.save();
  }

  return this;
});


app.directive('teacher', function(Store, Organizer) {
  return {
    restrict: 'E',
    template: '<div class="teacher" draggable droppable="receiveDrop" data-kind="teacher" data-id="{{ teacher.id }}">' +
        '<span ng-hide="hasPhoto()">{{ teacher.name }}</span><img class="image" ng-show="hasPhoto()" ng-src="{{ photo() }}">' +
      '</div>',
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

      $scope.hasPhoto = function() {
        return Store.trans.photos[$scope.teacher.id] ? true : false;
      }

      $scope.photo = function() {
        var img = Store.trans.photos[$scope.teacher.id];
        if (img) {
          return img;
        } else {
          return false;
        }
      };
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


app.directive('district', function(Store, Organizer) {
  return {
    restrict: 'E',
    template: '<div class="district" droppable="receiveDrop">' +
      '<div>' +
        '<input type="text" class="trans" ng-model="district.name" placeholder="district name" size="20">' +
        '<input type="text" class="trans" ng-model="district.leader" placeholder="leader" size="20">' +
        '<button class="pure-button" ng-click="hide=!hide"><span ng-show="hide">Expand</span><span ng-hide="hide">Collapse</span></button>' +
      '</div>' +
      '<div ng-hide="hide">' +
        '<companionship comp="comp" hidefamilies="{{ hidefamilies }}" ng-repeat="comp in companionships|toArray|filterCompanionships:searchtext"></companionship>' +
      '</div>' +
      '</div>',
    scope: {
      district: '=',
      searchtext: '@',
      hidefamilies: '@'
    },
    controller: function($scope) {
      $scope.companionships = {};

      $scope.$watch('district.companionships', function() {
        $scope.companionships = {};
        for (id in $scope.district.companionships) {
          $scope.companionships[id] = Store.state.companionships[id];
        }
      }, true);

      $scope.$watch('district.name', function() {
        Store.save();
      });
      $scope.$watch('district.leader', function() {
        Store.save();
      });

      $scope.receiveDrop = function(kind, id) {
        if (kind == 'companionship') {
          Organizer.assignToDistrict(Store.state.companionships[id], $scope.district);
        } else if (kind == 'teacher') {
          var companionship = Organizer.createCompanionship();
          Organizer.addCompanion(companionship, Store.state.teachers[id]);
          Organizer.assignToDistrict(companionship, $scope.district);
        } else if (kind == 'family') {
          var companionship = Organizer.createCompanionship();
          Organizer.addFamily(companionship, Store.state.families[id]);
          Organizer.assignToDistrict(companionship, $scope.district);
        }
      }
    }
  }
})

app.directive('companionship', function(Store, Organizer) {
  return {
    restrict: 'E',
    template: '<div class="companionship" draggable data-kind="companionship" data-id="{{ comp.id }}" ng-class="{\'need-companion\': needCompanion(), \'extra-companion\': extraCompanion(), \'need-family\': needFamily()}" droppable="receiveDrop">' +
        '<teacher obj="teacher" ng-repeat="teacher in teachers"></teacher>' +
        '<div ng-hide="hidefamilies">' +
        '<family fam="fam" ng-repeat="fam in families"></family>' +
        '</div>' +
      '</div>',
    scope: {
      comp: '=',
      hidefamilies: '@'
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

app.directive('draggable', function(Store) {
  return {
    restrict: 'A',
    link: function(scope, element, attrs) {
      element.draggable({
        revert: true,
        revertDuration: 100,
        zIndex: 100,
      });
      element.click(function(ev) {
        if (Store.trans.selected_thing == null) {
          scope.$apply(function() {
            Store.trans.selected_thing = element;
          });
          return false;
        }
      })
    },
    controller: function($scope, $element) {
      $scope.trans = Store.trans;
      $scope.$watch('trans.selected_thing', function() {
        $scope.adjustClass();
      });

      $scope.adjustClass = function() {
        if ($scope.trans.selected_thing
            && $scope.trans.selected_thing == $element) {
          $element.addClass('selected');
        } else {
          $element.removeClass('selected');
        }
      }
    }
  }
});

app.directive('droppable', function(Store) {
  return {
    restrict: 'A',
    link: function(scope, element, attrs) {
      var func = scope[attrs.droppable];
      var dropFunc = function(func, elem) {
        var id = $(elem).attr('data-id');
        var kind = $(elem).attr('data-kind');
        func(kind, id);
        scope.$apply();
        Store.trans.selected_thing = null;
      }.bind(this, func);
      $(element).droppable({
        drop: function(event, ui) {
          return dropFunc(ui.draggable);
        },
        greedy: true,
        hoverClass: 'drop-hover'
      });
      element.click(function(ev) {
        if (Store.trans.selected_thing != null) {
          if (Store.trans.selected_thing == element) {
            // same element
          } else {
            // different element
            dropFunc(Store.trans.selected_thing);

          }
          return false;
        }
      });
    }
  }
});

app.controller('OrganizeCtrl', function($scope, Store, Organizer, LDSorg) {
  $scope.teachers = Store.state.teachers;
  $scope.families = Store.state.families;
  $scope.companionships = Store.state.companionships;
  $scope.changes = Store.state.changes;
  $scope.districts = Store.state.districts;
  Organizer.fixOrphans();

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

  $scope.createDistrict = function() {
    Organizer.createDistrict();
  }

  $scope.clearChanges = function() {
    Organizer.clearChanges();
  }

  $scope.loadPhotos = function() {
    LDSorg.loadPhotos(Object.keys($scope.teachers));
  }

});

app.controller('GroupCtrl', function($scope, Store, Organizer) {
  $scope.teachers = Store.state.teachers;
  $scope.families = Store.state.families;
  $scope.groups = Store.state.groups;

  $scope.actual_groups = [];

  $scope.$watch('teachers', function() {
    $scope.computeGroups();
  }, true);
  $scope.$watch('families', function() {
    $scope.computeGroups();
  }, true);

  $scope.computeGroups = function() {
    var groups = {};
    angular.forEach($scope.groups, function(name) {
      groups[name] = true;
    });
    angular.forEach($scope.teachers, function(teacher) {
      groups[teacher.other_group] = true;
    });
    angular.forEach($scope.families, function(family) {
      groups[family.other_group] = true;
    });
    if (groups['null']) {
      delete groups['null'];
    }
    angular.copy(Object.keys(groups), $scope.actual_groups);
    if (!groups[null]) {
      $scope.actual_groups.push(null);
    }
    console.log($scope.actual_groups);
    if ($scope.groups === undefined) {
      $scope.groups = $scope.actual_groups;
      Store.state.groups = $scope.groups;
    } else {
      angular.extend($scope.groups, $scope.actual_groups);
    }
    console.log($scope.groups);
    Store.save();
  }

  $scope.addGroup = function(name) {
    $scope.groups.push(name);
    $scope.actual_groups.push(name);
    Store.save();
  }

  $scope.moveTeacherToGroup = function(teacher, group) {
    if (group === null || group === undefined) {
      teacher.other_group = null;
      Store.save();
    } else {
      Organizer.excludeTeacher(teacher, group);  
    }
  }
  $scope.moveFamilyToGroup = function(family, group) {
    if (group === null || group === undefined) {
      family.other_group = null;
      Store.save();
    } else {
      Organizer.excludeFamily(family, group)
    }
  }
})

app.controller('DebugCtrl', function($scope, Store) {
  $scope.teachers = Store.state.teachers;
  $scope.families = Store.state.families;
  $scope.companionships = Store.state.companionships;
  $scope.changes = Store.state.changes;
  $scope.districts = Store.state.districts;
})