(function() {
  'use strict';

  angular
    .module('app')
    .controller('ListCtrl', ListCtrl);

  function ListCtrl($scope, $rootScope, $cookies, localStorageService, $stateParams, $http, $uibModal, pimEntity, $window, EntityService, $document, $location, FileSaver, Blob, $extend){

    var vm              = $extend ? $extend : this;
    var oldPageNumber   = 1;

    //Properties
    vm.breadcrumb          = null;
    vm.countLabel          = '';
    vm.permissions         = localStorageService.get('permissions');
    vm.frontend            = localStorageService.get('frontend');
    vm.objects             = [];
    vm.objectsAvailable    = false;
    vm.objectsNotAvailable = false;

    vm.isExporting   = false;
    vm.itemsPerPage  = 0;
    vm.totalItems    = 0;
    vm.currentPage   = 1;
    vm.untranslatedRecords = [];
    vm.untranslatedLang    = null;

    if(pimEntity){
      vm.entity = 'PIM\\' + $stateParams.entity;
    }else{
      vm.entity = $stateParams.entity;
    }

    $rootScope.currentNav = vm.entity;

    vm.hideButtons =  $stateParams.hideButtons ? true : false;
    vm.canExport   = vm.permissions[vm.entity].export && vm.frontend.exportMethods && Object.keys(vm.frontend.exportMethods).length;
    vm.schema      = localStorageService.get('schema')[vm.entity];

    if(!vm.schema){
      $location.path('/');
      return;
    }

    vm.i18n         = vm.schema.settings.i18n;
    vm.canInsert    = true;

    vm.currentLang =   vm.frontend.languages ? vm.frontend.languages[0] : null;
    if($stateParams.lang){
      vm.currentLang = $stateParams.lang;
    }

    if($stateParams.untranslatedLang){
      vm.untranslatedLang = $stateParams.untranslatedLang;
    }


    vm.sortProperty = vm.schema.settings.sortBy;
    vm.sortOrder    = vm.schema.settings.sortOrder;
    vm.sortableOptions = {
      stop: function(e,ui){
        var resortObjectData = [];
        var sortOffset = vm.sortOrder == 'ASC';
        var objects = vm.objects;
        for(var i = 0; i < vm.objects.length; i++){
          var newSortPosition = vm.sortOrder == 'ASC' ? i : vm.objects.length - 1 - i;

          vm.objects[i].sorting = newSortPosition;

          resortObjectData.push({
            entity: vm.entity,
            id: vm.objects[i].id,
            data:{
              sorting: newSortPosition
            }
          });

        }

        var data = {
          objects: resortObjectData,
          lang: vm.currentLang
        };

        EntityService.multiupdate(data).then(
          function successCallback(response) {
            if(vm.filterSidebar && vm.filterSidebar.key == 'treeParent'){
              loadFilters('treeParent');
            }
          },
          function errorCallback(response) {
          }
        );

      },
      handle: '.sortable-handle'

    };
    vm.sortableObjects = [];

    vm.filter           = {};
    vm.datalistFilter   = {};
    vm.filterIsOpen     = false;
    vm.filterBadge      = 0;
    vm.filterJoins      = {};
    vm.filterTrees      = {};
    vm.filterSidebar    = null;
    vm.filterSidebarTitle=null;
    vm.treeOpened       = {};
    vm.treeResortWatcher=null;
    vm.treeSearch       = {};

    //Functions
    vm.back                     = back;
    vm.closeFilter              = closeFilter;
    vm.changeLang               = changeLang;
    vm.delete                   = doDelete;
    vm.executeFilter            = executeFilter;
    vm.exportData               = exportData;
    vm.filterSelect             = filterSelect;
    vm.filterTreeLabel          = filterTreeLabel;
    vm.openForm                 = openForm;
    vm.paginationChanged        = paginationChanged;
    vm.redirect                 = redirect;
    vm.refreshDatalistFilter    = refreshDatalistFilter;
    vm.resetFilter              = resetFilter;
    vm.resetTree                = resetTree;
    vm.showUntranslatedRecords  = showUntranslatedRecords;
    vm.sortBy                   = sortBy;
    vm.setFilter                = setFilter;
    vm.toggleFilter             = toggleFilter;
    vm.toggleTreeFilter         = toggleTreeFilter;

    //Startup
    init();
    loadData();
    loadFilters();


    ///////////////////////////////////

    function back(){
      $window.history.back();
    }

    function calcFilterBadge(){
      var badgeCount = 0;
      for (var key in vm.filter) {

        if(vm.filter[key]){
          badgeCount++;
        }
      }

      vm.filterBadge = badgeCount;
    }


    function closeFilter(){
      vm.filterIsOpen = false;
    }

    function changeLang(lang){
      vm.currentLang = lang;
      vm.untranslatedRecords = [];
      vm.untranslatedLang    = null;

      $location.search({'lang': lang});

      loadUntranslatedRecords();
      loadData();

      if(vm.filterSidebar){
        loadFilters(vm.filterSidebar.key);
      }
    }

    function doDelete(object){

      if(vm.schema.settings.readonly){
        return;
      }

      var langVariants = vm.i18n ? ' mit allen Sprachvarianten ' : '';

      var modaltitle = 'Wollen Sie den \'<b title="' + object.id + '">Eintrag ' + (object.id.length > 5 ? object.id.substr(0, 5) + '...' : object.id) + '\''  + langVariants + '</b> wirklich löschen?';
      if(vm.schema.settings.labelProperty){
        modaltitle = 'Wollen Sie <b>\'' + object[vm.schema.settings.labelProperty] + '\'' + langVariants + '</b> wirklich löschen?';
      }

      var modalInstance = $uibModal.open({
        templateUrl: '/ui/default/views/partials/modal.html?v=' + APP_VERSION,
        controller: 'ModalCtrl as vm',
        resolve: {
          title: function(){ return 'Eintrag löschen'; },
          body: function(){ return modaltitle; },
          object: function(){ return object; },
          hideCancelButton: false
        }
      });

      modalInstance.result.then(
        function (doDelete) {


          if(doDelete){

            vm.objectsAvailable = false;
            vm.objectsNotAvailable = false;

            var data = {
              entity: vm.entity,
              id: object.id,
              lang: vm.currentLang
            };

            EntityService.delete(data).then(
              function successCallback(response) {

                if(vm.filterSidebar && vm.filterSidebar.key == 'treeParent'){
                  loadFilters('treeParent');
                }

                loadData();
                loadUntranslatedRecords();
              },
              function errorCallback(response) {
                if(response.status == 401){
                  var modalInstance = $uibModal.open({
                    templateUrl: '/ui/default/views/partials/relogin.html?v=' + APP_VERSION,
                    controller: 'ReloginCtrl as vm',
                    backdrop: 'static'
                  });

                  modalInstance.result.then(
                    function () {
                      vm.delete(object);
                    },
                    function () {
                      $uibModalInstance.close();
                      $location.path('/logout');
                    }
                  );

                }else{
                  var modalInstance = $uibModal.open({
                    templateUrl: '/ui/default/views/partials/modal.html?v=' + APP_VERSION,
                    controller: 'ModalCtrl as vm',
                    resolve: {
                      title: function(){ return 'Fehler beim Löschen'; },
                      body: function(){ return response.data.message; },
                      hideCancelButton: true
                    }
                  });

                  modalInstance.result.then(
                    function () {
                      if(response.status == 550){
                        $location.path('/list/' + response.data.message_entity).search({'f_id' : object.id, 'lang' : response.data.message_lang, 'untranslatedLang' : null });
                      }else{
                        vm.objectsAvailable = true;
                        vm.objectsNotAvailable = false;
                      }

                    },
                    function () {
                      vm.objectsAvailable = true;
                      vm.objectsNotAvailable = false;
                    }
                  );

                }
              }
            );
          }
        },
        function () {

        }
      );
    }

    function executeFilter() {

      var savedDatalistFilter = localStorageService.get('savedDatalistFilter');
      if(!savedDatalistFilter){
        savedDatalistFilter = {};
      }
      savedDatalistFilter[vm.entity] = vm.datalistFilter;
      localStorageService.set('savedDatalistFilter', savedDatalistFilter);

      for (var key in vm.datalistFilter) {
        vm.filter[key] = vm.datalistFilter[key].id
      }

      var savedFilter = localStorageService.get('savedFilter');
      if(!savedFilter){
        savedFilter = {};
      }
      savedFilter[vm.entity] = vm.filter;
      localStorageService.set('savedFilter', savedFilter);

      calcFilterBadge();
      loadData();
    }

    function generateTree(entity, field, data, depth){
      var joinSchema = localStorageService.get('schema')[entity];

      vm.filterJoins[field] = vm.filterJoins[field] ? vm.filterJoins[field] : [];

      for(var i = 0; i < data.length; i++){
        var filler = '--'.repeat(depth);
        filler = filler ? filler + ' ' : filler;

        if(joinSchema.settings.labelProperty){
          data[i]['pim_filterTitle'] = filler + data[i][joinSchema.settings.labelProperty];
        }else{
          data[i]['pim_filterTitle'] = filler + data[i][joinSchema.list[Object.keys(joinSchema.list)[0]]];
        }

        vm.filterJoins[field].push(data[i]);
        if(data[i]['treeChilds']){
          var subDepth = depth + 1;
          generateTree(entity, field, data[i]['treeChilds'], subDepth);
        }
      }
    }

    function exportData(type){
      vm.isExporting = true;

      var filter = {};
      for (var key in vm.filter) {
        if(vm.filter[key]){
          filter[key] = vm.filter[key];
          if(vm.schema.properties[key] && vm.schema.properties[key].type == 'boolean'){
            filter[key] = vm.filter[key] == 'true' || vm.filter[key] == '1' ? true : false;
          }
        }
      }

      var data = {
        entity: vm.entity,
        where: filter,
        lang: vm.currentLang
      };
      EntityService.exportData(type, data).then(
        function successCallback(response) {
          var contentDisposition = response.headers('Content-Disposition');
          var filename = 'export';
          if(contentDisposition){
            var fnIndex = contentDisposition.indexOf("filename=");
            if(fnIndex >= 0){
              filename = contentDisposition.substr(fnIndex + 9);
            }
          }

          var data = new Blob([response.data], { type: response.data.type });
          FileSaver.saveAs(data, filename);

          vm.isExporting = false;

        },
        function errorCallback(response) {

          vm.isExporting = false;

          if(response.status == 401){
            var modalInstance = $uibModal.open({
              templateUrl: '/ui/default/views/partials/relogin.html?v=' + APP_VERSION,
              controller: 'ReloginCtrl as vm',
              backdrop: 'static'
            });

            modalInstance.result.then(
              function () {
                loadData();
              },
              function () {
                $uibModalInstance.close();
                $location.path('/logout');
              }
            );
          }

          if(response.status == 403){
            $location.path('/error');
          }
        }
      );
    }

    function filterSelect(key, item){
      vm.filter[key] = item.id;
      vm.executeFilter();
      vm.filterIsOpen = false;
    }

    function filterTreeLabel(entity, key){
      var value = vm.filter[key];

      if(!value){
        return 'Alle anzeigen';
      }

      if(value == -1){
        return 'Ohne Zuordnung';
      }

      entity = $rootScope.getShortEntityName(entity);

      var entityConfig  = localStorageService.get('schema')[entity];
      var labelProperty = entityConfig.settings.labelProperty ? entityConfig.settings.labelProperty : entityConfig.list[0];

      if(!value){
        return 'Bitte auswählen...';
      }

      var label = filterTreeLabelFinder(labelProperty, key, vm.filterJoins[key], value);
      return label;
    }

    function filterTreeLabelFinder(labelProperty, key, items, value){

      for(var index in items){
        var item = items[index];

        if(item.id == value){
          return item[labelProperty];
        }

        if(item.childs && item.childs.length > 0){
          var foundedItem = filterTreeLabelFinder(labelProperty, key, item.childs, value);

          if(foundedItem){
            return foundedItem;
          }
        }
      }
    }



    function init(){

      var savedFilter = localStorageService.get('savedFilter');
      if(savedFilter && savedFilter[vm.entity]){
        vm.filter = savedFilter[vm.entity];
      }

      var savedDatalistFilter = localStorageService.get('savedDatalistFilter');
      if(savedDatalistFilter && savedDatalistFilter[vm.entity]){
        vm.datalistFilter = savedDatalistFilter[vm.entity];
      }

      for (var key in $location.search()) {
        if (key.substr(0, 2) != 'f_') {
          continue;
        }
        var property = key.substr(2);

        vm.filter[property] = $location.search()[key];
      }

      if(vm.i18n){
        var i18nPermissions = localStorageService.get('i18nPermissions');

        if(i18nPermissions && i18nPermissions[vm.currentLang] && i18nPermissions[vm.currentLang] == 'readable'){
          vm.schema.settings.readonly = true;
          vm.schema.settings.viewMode = 1;
        }else if(i18nPermissions && i18nPermissions[vm.currentLang] && i18nPermissions[vm.currentLang] == 'translatable'){
          vm.permissions[vm.entity].deletable = false;
          vm.canInsert = false;
          loadUntranslatedRecords();
        }else{
          loadUntranslatedRecords();
        }


      }



      calcFilterBadge();
    }


    function loadData(){

      vm.objectsAvailable = false;
      vm.objectsNotAvailable = false;

      var sortSettings = {};
      sortSettings[vm.sortProperty] = vm.sortOrder;

      var properties = ['id'];

      for (key in vm.schema.list ) {
        properties.push(vm.schema.list[key]);
      }


      if(vm.schema.settings.type == 'tree' || vm.schema.settings.sortRestrictTo){
        vm.schema.settings.isSortable = false;
      }

      var filter = {};
      if(!vm.untranslatedLang) {
        for (var key in vm.filter) {
          if (vm.filter[key]) {
            filter[key] = vm.filter[key];
            if (vm.schema.settings.type == 'tree' && key == 'treeParent' && vm.filter[key]) {
              vm.schema.settings.isSortable = true;
            }
            if (vm.schema.settings.sortRestrictTo && key == vm.schema.settings.sortRestrictTo && vm.filter[key]) {
              vm.schema.settings.isSortable = true;
            }

            if (vm.schema.properties[key] && vm.schema.properties[key].type == 'boolean') {
              filter[key] = vm.filter[key] == 'true' || vm.filter[key] == '1' ? true : false;
            }
          }
        }
      }else{
        vm.filter['treeParent'] = -1;
      }

      if(vm.schema.settings.isSortable){
        properties.push('sorting');
      }

      var currentPage = vm.schema.settings.isSortable || vm.schema.settings.type == 'tree' ? 0 : vm.currentPage;

      var data = {
        entity: vm.entity,
        currentPage: currentPage,
        order: sortSettings,
        where: filter,
        properties: properties,
        flatten:false,
        lang: vm.currentLang,
        untranslatedLang: vm.untranslatedLang
      };

      EntityService.list(data).then(
        function successCallback(response) {

          if(vm.untranslatedLang && response.data.totalItems == 0){
            vm.untranslatedLang = null;
            loadData();
            return;
          }

          if(vm.itemsPerPage === 0) {
            vm.itemsPerPage = response.data.itemsPerPage;
          }

          var objectsData  = [];


          if(vm.schema.settings.type == 'tree'){
            delete vm.schema.list[1];
            delete vm.schema.list[2];
          }

          objectsData  = response.data.data;

          vm.totalItems = response.data.totalItems;
          vm.objects    = objectsData;

          if((data.currentPage == 0 || (vm.itemsPerPage * data.currentPage) >=  vm.totalItems && data.currentPage == 1) || vm.schema.settings.type == 'tree'){
            vm.countLabel = vm.totalItems + (vm.totalItems == 1 ? ' Datensatz' : ' Datensätze');
          }else{
            var end = (vm.itemsPerPage * data.currentPage) > vm.totalItems ? vm.totalItems : (vm.itemsPerPage * data.currentPage);
            vm.countLabel = 'Datensatz ' + ((vm.itemsPerPage * (data.currentPage-1))+1) + ' bis ' + end + ' von insgesamt ' + vm.totalItems;
          }

          vm.objectsAvailable = true;
          vm.objectsNotAvailable = false;
        },
        function errorCallback(response) {
          vm.objectsAvailable = false;
          vm.objectsNotAvailable = true;
          vm.countLabel = '0 Datensätze';

          if(response.status == 404 && vm.untranslatedLang){
            vm.untranslatedLang = null;
            $location.search({'lang': vm.currentLang});
            loadData();
          }

          if(response.status == 401){
            var modalInstance = $uibModal.open({
              templateUrl: '/ui/default/views/partials/relogin.html?v=' + APP_VERSION,
              controller: 'ReloginCtrl as vm',
              backdrop: 'static'
            });

            modalInstance.result.then(
              function () {
                loadData();
              },
              function () {
                $uibModalInstance.close();
                $location.path('/logout');
              }
            );
          }

          if(response.status == 500 ) {
            var modalInstance = $uibModal.open({
              templateUrl: '/ui/default/views/partials/modal.html?v=' + APP_VERSION,
              controller: 'ModalCtrl as vm',
              resolve: {
                title: function () {
                  return 'Serverfehler';
                },
                body: function () {
                  return response.data.message;
                },
                hideCancelButton: function () {
                  return false;
                }
              }
            });
          }

          if(response.status == 403){
            $location.path('/error');
          }
        }
      );
    }



    function loadFilters(onlyFilterForKey){
      for (var key in vm.schema.properties) {
        if(onlyFilterForKey && key !=onlyFilterForKey) continue;


        if((vm.schema.properties[key].type == 'join' || vm.schema.properties[key].type == 'virtualjoin')  && vm.schema.properties[key].isFilterable ){


          var entity = $rootScope.getShortEntityName(vm.schema.properties[key].accept);

          if (!vm.permissions[entity].readable) {
            continue;
          }

          if(vm.schema.properties[key].isDatalist && localStorageService.get('schema')[entity].settings.type != 'tree'){
            continue;
          }

          var joinSchema   = localStorageService.get('schema')[entity];
          var entityConfig = localStorageService.get('schema')[entity];

          if (entityConfig.settings.type == 'tree') {


            var filterData = {
              entity: entity,
              lang: vm.currentLang
            };

            vm.filterTrees[key] = true;

            if(vm.schema.properties[key].isSidebar){
              vm.filterSidebar = {
                key: key,
                entity: entity,
                items: [],
                isLoading: true
              }

              vm.filterSidebarTitle = joinSchema.settings.label;
            }

            EntityService.tree2(filterData).then(
              (function (entity, key, entityConfig) {
                return function (response) {
                  vm.filterJoins[key] = response.data.data;

                  if(vm.schema.properties[key].isSidebar){
                    vm.filterSidebar = {
                      key: key,
                      entity: entity,
                      items: response.data.data,
                      sLoading: false
                    }

                    vm.filterSidebarTitle = joinSchema.settings.label;
                  }


                }
              })(entity, key, entityConfig),
              function errorCallback(response) {
                vm.filterSidebar = {
                  key: key,
                  entity: entity,
                  items: response.data.data,
                  isLoading: false
                }
              }
            );
          } else {

            var orderMode  = 'DESC';
            var orderField = 'created';

            if(joinSchema.settings.sortBy){
              orderField = joinSchema.settings.sortBy;
              orderMode  = joinSchema.settings.sortOrder ? joinSchema.settings.sortOrder : orderMode;
            }

            var properties = ['id'];
            if (joinSchema.settings.isSortable) {
              properties.push('sorting');
              orderField  = 'sorting';
              orderMode   = 'ASC';
            }
            for (var key2 in joinSchema.list) {
              properties.push(joinSchema.list[key2]);
            }

            var order = {};
            order[orderField] = orderMode;

            var filterData = {
              entity: entity,
              properties: properties,
              flatten: true,
              lang: vm.currentLang,
              order: order
            };


            EntityService.list(filterData).then(
              (function (entity, key, joinSchema) {
                return function (response) {
                  vm.filterJoins[key] = response.data.data;
                  for (var i = 0; i < vm.filterJoins[key].length; i++) {
                    if (!vm.filterJoins[key][i]['pim_filterTitle']) {
                      if (joinSchema.settings.labelProperty) {
                        vm.filterJoins[key][i]['pim_filterTitle'] = vm.filterJoins[key][i][joinSchema.settings.labelProperty];
                      } else {
                        vm.filterJoins[key][i]['pim_filterTitle'] = vm.filterJoins[key][i][joinSchema.list[Object.keys(joinSchema.list)[0]]];
                      }
                    }
                  }
                }
              })(entity, key, joinSchema),
              function errorCallback(response) {
              }
            );
          }

        }else if(vm.schema.properties[key].type == 'multijoin' && vm.schema.properties[key].isFilterable){
          var entity      = $rootScope.getShortEntityName(vm.schema.properties[key].accept);
          var joinSchema  = localStorageService.get('schema')[entity];
          var field       = key;

          if(!vm.permissions[entity].readable){
            continue;
          }

          if(vm.schema.properties[key].isDatalist && joinSchema.settings.type != 'tree'){
            continue;
          }

          if(joinSchema.settings.type == 'tree'){

            var filterData = {
              entity: entity,
              lang: vm.currentLang
            };

            vm.filterTrees[key] = true;

            if(vm.schema.properties[key].isSidebar){
              vm.filterSidebar = {
                key: key,
                entity: entity,
                items: [],
                isLoading: true
              }

              vm.filterSidebarTitle = joinSchema.settings.label;
            }

            EntityService.tree2(filterData).then(
              (function (entity, key, entityConfig) {
                return function (response) {
                  vm.filterJoins[key] = response.data.data;

                  if(vm.schema.properties[key].isSidebar){
                    vm.filterSidebar = {
                      key: key,
                      entity: entity,
                      items: response.data.data,
                      isLoading: false
                    }

                    vm.filterSidebarTitle = joinSchema.settings.label;
                  }


                }
              })(entity, key, entityConfig),
              function errorCallback(response) {
              }
            );
          }else{

            EntityService.list({entity: entity, flatten: true, lang: vm.currentLang}).then(
              (function(entity, key) {
                return function(response) {
                  var joinSchema = localStorageService.get('schema')[entity];
                  vm.filterJoins[key] = response.data.data;

                  for(var i = 0; i < vm.filterJoins[key].length; i++){
                    if(!vm.filterJoins[key][i]['pim_filterTitle']){
                      if(joinSchema.settings.labelProperty){
                        vm.filterJoins[key][i]['pim_filterTitle'] = vm.filterJoins[key][i][joinSchema.settings.labelProperty];
                      }else{
                        vm.filterJoins[key][i]['pim_filterTitle'] = vm.filterJoins[key][i][joinSchema.list[Object.keys(joinSchema.list)[0]]];
                      }
                    }
                  }
                }
              })(entity, key),
              function errorCallback(response) {
              }
            );
          }


        }else if(vm.schema.properties[key].type == 'checkbox' && vm.schema.properties[key].isFilterable){
          var entity = 'PIM\\Option';

          var field = key;

          if(!vm.permissions[entity].readable){
            continue;
          }

          var where  = {group: vm.schema.properties[key].group};

          EntityService.list({entity: entity, flatten: true, where : where}).then(
            (function(entity, key) {
              return function(response) {
                var joinSchema = localStorageService.get('schema')[entity];
                vm.filterJoins[key] = response.data.data;

                for(var i = 0; i < vm.filterJoins[key].length; i++){
                  if(!vm.filterJoins[key][i]['pim_filterTitle']){
                    vm.filterJoins[key][i]['pim_filterTitle'] = vm.filterJoins[key][i]['value'];
                  }
                }
              }
            })(entity, key),
            function errorCallback(response) {
            }
          );

        }else if(vm.schema.properties[key].type == 'virtualjoin' && vm.schema.properties[key].isFilterable){

          var entity = $rootScope.getShortEntityName(vm.schema.properties[key].accept);

          if(!vm.permissions[entity].readable){
            continue;
          }

          EntityService.list({entity: entity, flatten: true}).then(
            (function(entity, key) {
              return function(response) {
                var joinSchema = localStorageService.get('schema')[entity];
                vm.filterJoins[key] = response.data.data;
                for(var i = 0; i < vm.filterJoins[key].length; i++){
                  if(!vm.filterJoins[key][i]['pim_filterTitle']){
                    if(joinSchema.settings.labelProperty){
                      vm.filterJoins[key][i]['pim_filterTitle'] = vm.filterJoins[key][i][joinSchema.settings.labelProperty];
                    }else{
                      vm.filterJoins[key][i]['pim_filterTitle'] = vm.filterJoins[key][i][joinSchema.list[Object.keys(joinSchema.list)[0]]];
                    }
                  }
                }
              }
            })(entity, key),
            function errorCallback(response) {
            }
          );



        }else if(vm.schema.properties[key].isFilterable){
          var field = key;

          var data = {
            entity: vm.entity,
            properties: [field],
            groupBy: field
          };

          data['order'] = {};
          data['order'][field] = "ASC";

          EntityService.list(data).then(
            (function(entity, key) {
              return function(response) {
                vm.filterJoins[key] = response.data.data;

                for(var i = 0; i < vm.filterJoins[key].length; i++){
                  if(!vm.filterJoins[key][i]['pim_filterTitle']){
                    vm.filterJoins[key][i]['pim_filterTitle'] = vm.filterJoins[key][i][key];
                  }
                }
              }
            })(entity, key),
            function errorCallback(response) {
            }
          );
        }


      }
    }

    function loadUntranslatedRecords(){
      EntityService.translations(vm.entity, vm.currentLang).then(
        function successCallback(response) {
          vm.untranslatedRecords = response.data.data;
        },
        function errorCallback(response) {

        }
      );
    }

    function toggleTreeFilter(key){
      vm.treeOpened[key] = vm.treeOpened[key] ? false : true;
    }

    function openForm(object, index, readonly, copy, defaultVals){

      if(vm.schema.settings.readonly && vm.schema.settings.viewMode != 1){
        return;
      }

      var preparedData = {};

      if(defaultVals){
        preparedData= defaultVals;
      }else{
        preparedData = vm.filter;
      }

      var doInsert     = false;
      var objectToForm = null;
      if(!object){
        doInsert = true;
        objectToForm = {};

        for (var key in vm.schema.properties) {
          if(!vm.schema.properties[key].type == 'join' && !preparedData[key]){
            continue;
          }

          objectToForm[key] = preparedData[key];
        }

      }else{

        if(copy){
          objectToForm = JSON.parse(JSON.stringify(object));
        }else{
          objectToForm  = object;
        }
      }

      var templateUrl = '/ui/default/views/form.html?v=' + APP_VERSION;
      var controller  = 'FormCtrl as vm';

      if(extendedRoutes['form'] && (!extendedRoutes['form'][0]['stateParams'] || extendedRoutes['form'][0]['stateParams'] && extendedRoutes['form'][0]['stateParams']['entity'] == $stateParams.entity)){
        templateUrl =  extendedRoutes['form'][0]['template'];
        controller  = extendedRoutes['form'][0]['controller'] + ' as vm';
      }

      var modalInstance = $uibModal.open({
        templateUrl: templateUrl,
        controller: controller,
        resolve: {
          entity: function(){ return vm.entity;},
          object: function(){ return objectToForm; },
          lang: function(){ return vm.currentLang},
          translateFrom:  function(){ return vm.untranslatedLang},
          doCopy: copy,
          readonly: readonly != 1 ? false : true,
          '$extend': function(){ return null;}
        },
        backdrop: 'static',
        size: 'xl'
      });


      modalInstance.result.then(
        function (updatedObject) {
          if(doInsert || copy || !updatedObject){

            loadData();
            loadUntranslatedRecords();
          }else{
            vm.objects[index] = updatedObject;
          }

          if(vm.filterSidebar && vm.filterSidebar.key == 'treeParent'){
            loadFilters('treeParent');
          }
        },
        function () {
        }
      );


    }

    function paginationChanged(newPageNumber) {
      if(oldPageNumber == newPageNumber){
        return;
      }
      vm.objectsAvailable = false;
      vm.currentPage = newPageNumber;
      oldPageNumber = newPageNumber;

      loadData();
    }

    function redirect(path){
      $location.url(path);
    }

    function refreshDatalistFilter(key, sWord){

      var entity = $rootScope.getShortEntityName(vm.schema.properties[key].accept);

      if (!vm.permissions[entity].readable) {
        return;
      }


      var joinSchema = localStorageService.get('schema')[entity];

      var properties = ['id'];
      if (joinSchema.settings.isSortable) {
        properties.push('sorting');
      }
      for (var key2 in joinSchema.list) {
        properties.push(joinSchema.list[key2]);
      }

      var data = {
        entity: entity,
        properties: properties,
        flatten: true
      };

      if(vm.schema.properties[key].isDatalist){
        data.itemsPerPage = 15;
        data.currentPage = 1;
      }

      if(sWord){
        data.where = {fulltext: sWord};
      }

      EntityService.list(data).then(
        (function (entity, key, joinSchema) {
          return function (response) {
            if(sWord || !vm.schema.properties[key].isDatalist){
              vm.filterJoins[key] = [];
            }else{
              vm.filterJoins[key] = [
                {
                  id: 0,
                  pim_filterTitle: 'alle anzeigen',
                  group: 'Allgemein'
                },
                {
                  id: -1,
                  pim_filterTitle: 'Ohne Zuordnung',
                  group: 'Allgemein'
                }
              ];
            }

            for (var i = 0; i < response.data.data.length; i++) {

              response.data.data[i]['group'] = 'Objekte';
              if (!response.data.data[i]['pim_filterTitle']) {
                if (joinSchema.settings.labelProperty) {
                  response.data.data[i]['pim_filterTitle'] = response.data.data[i][joinSchema.settings.labelProperty];
                } else {
                  response.data.data[i]['pim_filterTitle'] = response.data.data[i][joinSchema.list[Object.keys(joinSchema.list)[0]]];
                }
              }
            }

            vm.filterJoins[key] = vm.filterJoins[key].concat(response.data.data);
          }
        })(entity, key, joinSchema),
        function errorCallback(response) {
        }
      );
    }

    function setFilter(property, value){
      vm.filter[property] = value;
      executeFilter();
    }

    function resetTree(){
        delete vm.filter['treeParent'];

      loadData();
    }

    function resetFilter() {

      vm.filter = {};

      vm.filterBadge = 0;
      vm.filterIsOpen = false;
      vm.datalistFilter = {};

      localStorageService.set('savedDatalistFilter', vm.datalistFilter);
      localStorageService.set('savedFilter', vm.filter);

      loadData();
    }

    function showUntranslatedRecords(lang){
      vm.untranslatedLang = lang;

      $location.search('untranslatedLang', lang);
      loadData();
    }

    function sortBy(property) {
      if(vm.sortProperty === property) {
        if(vm.sortOrder === 'DESC') {
          vm.sortOrder = 'ASC';
        } else {
          vm.sortOrder = 'DESC';
        }
      } else {
        vm.sortProperty = property;
        vm.sortOrder = 'ASC';
      }
      loadData();
    }

    function toggleFilter(open){
      if(open){
        $document.find('#fulltext').focus();

      }
    }



  }

})();
