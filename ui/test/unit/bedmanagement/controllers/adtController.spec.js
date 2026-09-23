'use strict';

describe("AdtController", function () {
    var scope, state, rootScope, controller, bedService, appService, sessionService, dispositionService, visitService, encounterService, ngDialog, window, messagingService, spinnerService, translate, bedQuotationService, consultationPaymentGateService, observationsService, $q;

    beforeEach(function () {
        module('bahmni.ipd');

        inject(function ($controller, $rootScope, _$q_) {
            controller = $controller;
            rootScope = $rootScope;
            scope = $rootScope.$new();
            scope.patient = { uuid: "patientUuid" };
            $q = _$q_;
        });

        bedService = jasmine.createSpyObj('bedService', ['assignBed', 'getCompleteBedDetailsByBedId']);
        appService = jasmine.createSpyObj('appService', ['getAppDescriptor']);
        sessionService = jasmine.createSpyObj('sessionService', ['getLoginLocationUuid']);
        dispositionService = jasmine.createSpyObj('dispositionService', ['getDispositionActions']);
        visitService = jasmine.createSpyObj('visitService', ['getVisitSummary','endVisit', 'endVisitAndCreateEncounter', 'search']);
        encounterService = jasmine.createSpyObj('encounterService', ['create', 'discharge', 'buildEncounter']);
        ngDialog = jasmine.createSpyObj('ngDialog', ['openConfirm', 'close']);
        messagingService = jasmine.createSpyObj('messagingService', ['showMessage']);
        spinnerService = jasmine.createSpyObj('spinnerService', ['forPromise']);
        state = jasmine.createSpyObj('state', ['transitionTo']);
        window = {location: { reload: jasmine.createSpy()} };
        translate = jasmine.createSpyObj('$translate', ['instant']);
        bedQuotationService = jasmine.createSpyObj('bedQuotationService', ['submitQuotation', 'cancelReservation', 'getActivePatientReservation']);
        bedQuotationService.submitQuotation.and.returnValue($q.when({data: {}}));
        bedQuotationService.cancelReservation.and.returnValue($q.when({data: {}}));
        bedQuotationService.getActivePatientReservation.and.returnValue($q.when({data: {found: false}}));
        consultationPaymentGateService = jasmine.createSpyObj('consultationPaymentGateService', ['isServicePaid']);
        consultationPaymentGateService.isServicePaid.and.returnValue($q.when(false));
        observationsService = jasmine.createSpyObj('observationsService', ['fetch']);
        observationsService.fetch.and.returnValue($q.when({data: []}));

        appService.getAppDescriptor.and.returnValue({
            getConfigValue: function (key) {
                if (key === 'hideStartNewVisitPopUp') {
                    return true;
                } else if (key === 'defaultVisitType') {
                    return "IPD";
                } else  {
                    return {};
                }
            }, getExtensions: function (a, b) {
                return {
                    maxPatientsPerBed: 2
                };
            },
            getConfig: function () {
                return {value: "#/bedManagement/bed/{{bedId}}"};
            },
            formatUrl: function (url, options) {
                return "#/bedManagement/bed/12";
            }
        });

        rootScope.selectedBedInfo = {};
        rootScope.encounterConfig = {
            getVisitTypes: function () {
                return [{name : "Current Visit", uuid : "visitUuid2"}, {name : "IPD", uuid : "visitUuid"}];
            }, getAdmissionEncounterTypeUuid: function () {
                return "admitEncounterTypeUuid";

            }, getDischargeEncounterTypeUuid: function () {
                return "dischargeEncounterTypeUuid";

            }, getTransferEncounterTypeUuid: function () {
                return "transferEncounterTypeUuid";
            }
        };

        rootScope.selectedBedInfo.bed = {
            bedId: 9,
            bedNumber: "404-i",
            bedType: "normal bed",
            bedTags: [],
            status: "OCCUPIED"
        };
        var visitServicePromise = specUtil.createServicePromise('getVisitSummary');
        visitService.getVisitSummary.and.returnValue(visitServicePromise);
        var searchPromise = specUtil.createServicePromise('search');
        visitService.search.and.returnValue(searchPromise);
        dispositionService.getDispositionActions.and.returnValue({});
        sessionService.getLoginLocationUuid.and.returnValue("someLocationUuid");
        bedService.assignBed.and.returnValue(specUtil.createServicePromise("assignBed"));
    });

    var createController = function () {
        spinnerService.forPromise.and.callFake(function () {
            return {
                then: function () {
                    return {};
                }
            };
        });

        spyOn(scope, "$emit");

        controller('AdtController', {
            $scope: scope,
            $rootScope: rootScope,
            $state: state,
            $stateParams: {patientUuid: "patientUuid", visitUuid: "visitUuid"},
            sessionService: sessionService,
            dispositionService: dispositionService,
            encounterService: encounterService,
            bedService: bedService,
            appService: appService,
            visitService: visitService,
            ngDialog: ngDialog,
            $window: window,
            messagingService : messagingService,
            spinner: spinnerService,
            $translate: translate,
            bedQuotationService: bedQuotationService,
            consultationPaymentGateService: consultationPaymentGateService,
            observationsService: observationsService
        });
    };

    it("Should show confirmation dialog if patient's visit type is not defaultVisitType and hideStartNewVisitPopUp is not present", function () {
        scope.visitSummary = {"visitType": "OPD"};
        appService.getAppDescriptor.and.returnValue({
            getConfigValue: function (key) {
                var configs = {hideStartNewVisitPopUp: false, dashboard: ''};
                return configs[key];
            }, getExtensions: function () {
                return {
                    maxPatientsPerBed: 2
                };
            },
            getConfig: function () {
            }
        });
        createController();

        scope.admit();
        expect(ngDialog.openConfirm.calls.count()).toBe(1);
        var args = ngDialog.openConfirm.calls.argsFor(0)[0];
        expect(args.scope).toBe(scope);
        expect(args.template).toBe('views/visitChangeConfirmation.html');
        expect(args.closeByEscape).toBe(true);
        expect(typeof args.preCloseCallback).toBe('function');
        args.preCloseCallback();
        expect(scope.buttonClicked).toBe(false);
    });

    it("Should show confirmation dialog if patient's visit type is not defaultVisitType and hideStartNewVisitPopUp is present", function () {
        scope.visitSummary = {"visitType": "OPD"};
        appService.getAppDescriptor.and.returnValue({
            getConfigValue: function (key) {
                var configs = {hideStartNewVisitPopUp: true, dashboard: ''};
                return configs[key];
            }, getExtensions: function () {
                return {
                    maxPatientsPerBed: 2
                };
            },
            getConfig: function () {
            }
        });

        createController();

        scope.admit();
        expect(ngDialog.openConfirm.calls.count()).toBe(1);
        var args = ngDialog.openConfirm.calls.argsFor(0)[0];
        expect(args.scope).toBe(scope);
        expect(args.template).toBe('views/admitConfirmation.html');
        expect(args.closeByEscape).toBe(true);
        expect(args.className).toBe("ngdialog-theme-default ng-dialog-adt-popUp");
        expect(typeof args.preCloseCallback).toBe('function');
        args.preCloseCallback();
        expect(scope.buttonClicked).toBe(false);
    });

    it("should close the visit and create a new encounter if dialog is confirmed", function () {
        var visitSummary = {"visitType": "Current Visit", "uuid": "visitUuid", "stopDateTime": null};
        scope.patient = {uuid: "123"};
        scope.adtObservations = [];
        scope.visitSummary = {uuid: "visitUuid"};

        var stubPromise = function (data) {
            return {
                then: function (successFn) {
                    successFn({data: data});
                }
            };
        };
        visitService.getVisitSummary.and.returnValue(specUtil.createFakePromise(visitSummary));
        visitService.endVisitAndCreateEncounter.and.callFake(stubPromise);
        encounterService.buildEncounter.and.returnValue({encounterUuid: 'uuid'});
        createController();

        scope.closeCurrentVisitAndStartNewVisit();

        expect(encounterService.buildEncounter).toHaveBeenCalledWith({
            patientUuid: '123',
            encounterTypeUuid: 'admitEncounterTypeUuid',
            visitTypeUuid: 'visitUuid',
            observations: [],
            locationUuid: 'someLocationUuid'
        });
        expect(scope.visitSummary.visitType).toBe(visitSummary.visitType);
        expect(scope.visitSummary.uuid).toBe(visitSummary.uuid);
        expect(visitService.endVisitAndCreateEncounter).toHaveBeenCalledWith("visitUuid", {encounterUuid: 'uuid'});
        expect(ngDialog.close).toHaveBeenCalled();
    });

    it("Should close the confirmation dialog if cancelled", function () {
        scope.visitSummary = {"visitType": "IPD"};
        scope.patient = {uuid : '123'};
        encounterService.create.and.callFake(function () {
            return {
                then: function (callback) {
                    return callback({});
                }
            };
        });
        createController();

        scope.cancelConfirmationDialog();

        expect(ngDialog.close).toHaveBeenCalled();
    });

    it("Should create an encounter with in the current visit if continued", function () {
        scope.visitSummary = {"visitType": "Current Visit", "uuid": "visitUuid"};
        scope.patient = {uuid: "123"};
        scope.adtObservations = [];

        var stubTwoPromise = function (data) {
            return {
                then: function (successFn) {
                    successFn({results: data});
                }
            };
        };

        var encounterResponse = {
            patientUuid: '123',
            encounterTypeUuid: "admitEncounterTypeUuid",
            visitTypeUuid: "visitUuid",
            observations: [],
            locationUuid: 'someLocationUuid'
        };
        visitService.endVisit.and.callFake(stubTwoPromise);
        encounterService.create.and.returnValue(specUtil.simplePromise({data: encounterResponse}));
        createController();

        scope.continueWithCurrentVisit();

        expect(encounterService.create).toHaveBeenCalledWith(encounterResponse);
        expect(ngDialog.close).toHaveBeenCalled();
    });

    it("Should not create encounter with in the current visit if closed", function () {
        scope.visitSummary = {"visitType": "Current Visit", "uuid": "visitUuid"};
        scope.patient = {uuid: "123"};
        scope.adtObservations = [];

        var stubOnePromise = function (data) {
            return {
                then: function (successFn) {
                    successFn({results: data});
                }
            };
        };
        var stubTwoPromise = function (data) {
            return {
                then: function (successFn) {
                    successFn({results: data});
                }
            };
        };
        visitService.endVisit.and.callFake(stubTwoPromise);
        encounterService.create.and.callFake(stubOnePromise);
        createController();

        expect(encounterService.create).not.toHaveBeenCalledWith({
            patientUuid: '123',
            encounterTypeUuid: undefined,
            visitTypeUuid: "visitUuid",
            observations: [],
            locationUuid: 'someLocationUuid'
        });
        expect(ngDialog.close).not.toHaveBeenCalled();
    });

    it("should show an error message and not close the current visit when defaultVisitType is not configured and yet the user decides to close the current visit and create a new visit of type defaultVisitType", function () {
        scope.visitSummary = {"visitType": "Current Visit", "uuid": "visitUuid"};
        scope.patient = {uuid: "123"};
        scope.adtObservations = [];

        appService.getAppDescriptor.and.returnValue({
            getConfigValue: function () {
                return {dashboard : ''};
            }, getExtensions: function () {
                return {
                    maxPatientsPerBed: 2
                };
            },
            getConfig: function () {
            }
        });

        createController();

        scope.closeCurrentVisitAndStartNewVisit();

        expect(messagingService.showMessage).toHaveBeenCalled();
        expect(visitService.endVisit).not.toHaveBeenCalled();
        expect(ngDialog.close).toHaveBeenCalled();
    });

    it("should show an error message when defaultVisitType is not configured and patient doesn't have any visit open while admitting", function () {
        scope.visitSummary = null;
        scope.patient = {uuid: "123"};
        scope.adtObservations = [];
        rootScope.selectedBedInfo.bed = undefined;

        appService.getAppDescriptor.and.returnValue({
            getConfigValue: function () {
                return {dashboard : ''};
            }, getExtensions: function () {
                return {
                    maxPatientsPerBed: 2
                };
            },
            getConfig: function () {
            }
        });

        createController();

        scope.admit();

        expect(messagingService.showMessage).toHaveBeenCalled();
        expect(encounterService.create).not.toHaveBeenCalled();
    });

    it("Should have Admit Patient action if the patient is discharged the visit has closed", function () {
        var visitSummary = {
            "visitType": "Current Visit", "uuid": "visitUuid", "stopDateTime": "1452764060000",
            "dischargeDetails": {uuid: "someDischargeUuid"}, "admissionDetails": {"uuid": "someadmissionDetails"}
        };
        visitService.getVisitSummary.and.returnValue(specUtil.createFakePromise(visitSummary));

        scope.patient = {uuid: "123"};
        scope.adtObservations = [];
        var response = {
            "results": [{
                "answers": [{"name": {"name": "Undo Discharge", "uuid": "c2bc09b3"}},
                    {"name": {"name": "Admit Patient", "uuid": "avb231rt"}},
                    {"name": {"name": "Discharge Patient", "uuid": "81cecc80"}},
                    {"name": {"name": "Transfer Patient", "uuid": "81d1cf4e"}}]
            }]
        };
        dispositionService.getDispositionActions.and.returnValue(response);
        var stubOnePromise = function (data) {
            return {
                then: function (successFn) {
                    successFn({results: data});
                }
            };
        };
        var stubTwoPromise = function (data) {
            return {
                then: function (successFn) {
                    successFn({results: data});
                }
            };
        };

        var stubSearchPromise = function (data) {
            return {
                then: function (successFunction) {
                    var searchResponse = {
                        results: [{uuid: "visitUuid"}]
                    };
                    return successFunction({data: searchResponse});
                }
            };
        };
        visitService.endVisit.and.callFake(stubTwoPromise);
        encounterService.create.and.callFake(stubOnePromise);
        visitService.search.and.callFake(stubSearchPromise);

        createController();
        expect(scope.dispositionActions).toEqual([{"name": {"name": "Admit Patient", "uuid": "avb231rt"}}]);
    });

    it("Should have Undo Discharge action if the patient is discharged and visit is open", function () {
        var visitSummary = {
            "visitType": "Current Visit", "uuid": "visitUuid", "stopDateTime": null,
            "dischargeDetails": {uuid: "someDischargeUuid"}, "admissionDetails": {"uuid": "someadmissionDetails"}
        };
        visitService.getVisitSummary.and.returnValue(specUtil.createFakePromise(visitSummary));

        scope.patient = {uuid: "123"};
        scope.adtObservations = [];
        var response = {
            "results": [{
                "answers": [{"name": {"name": "Undo Discharge", "uuid": "c2bc09b3"}},
                    {"name": {"name": "Admit Patient", "uuid": "avb231rt"}},
                    {"name": {"name": "Discharge Patient", "uuid": "81cecc80"}},
                    {"name": {"name": "Transfer Patient", "uuid": "81d1cf4e"}}]
            }]
        };
        var stubSearchPromise = function (data) {
            return {
                then: function (successFunction) {
                    var searchResponse = {
                        results: [{uuid: "visitUuid"}]
                    };
                    return successFunction({data: searchResponse});
                }
            };
        };
        visitService.search.and.callFake(stubSearchPromise);
        dispositionService.getDispositionActions.and.returnValue(response);
        encounterService.create.and.returnValue(specUtil.createServicePromise("create"));

        createController();
        scope.continueWithCurrentVisit();
        expect(scope.dispositionActions).toEqual([{"name": {"name": "Undo Discharge", "uuid": "c2bc09b3"}}]);
    });

    it("Should have Discharge Patient and Transfer Patient action if the patient is admitted", function () {
        var visitSummary = {
            "visitType": "Current Visit", "uuid": "visitUuid", "stopDateTime": null,
            "admissionDetails": {"uuid": "someadmissionDetails"}
        };
        visitService.getVisitSummary.and.returnValue(specUtil.createFakePromise(visitSummary));

        scope.patient = {uuid: "123"};
        scope.adtObservations = [];
        var response = {
            "results": [{
                "answers": [{"name": {"name": "Undo Discharge", "uuid": "c2bc09b3"}},
                    {"name": {"name": "Admit Patient", "uuid": "avb231rt"}},
                    {"name": {"name": "Discharge Patient", "uuid": "81cecc80"}},
                    {"name": {"name": "Transfer Patient", "uuid": "81d1cf4e"}}]
            }]
        };
        dispositionService.getDispositionActions.and.returnValue(response);
        var stubOnePromise = function (data) {
            return {
                then: function (successFn) {
                    successFn({results: data});
                }
            };
        };
        var stubSearchPromise = function (data) {
            return {
                then: function (successFunction) {
                    var searchResponse = {
                        results: [{uuid: "visitUuid"}]
                    };
                    return successFunction({data: searchResponse});
                }
            };
        };
        visitService.search.and.callFake(stubSearchPromise);
        encounterService.create.and.callFake(stubOnePromise);

        createController();
        expect(scope.dispositionActions).toEqual([{"name": {"name": "Discharge Patient", "uuid": "81cecc80"}},
            {"name": {"name": "Transfer Patient", "uuid": "81d1cf4e"}}]);
    });

    it("Should have Admit Patient action if the patient is not admitted in given visit", function () {
        var visitSummary = {"visitType": "Current Visit", "uuid": "visitUuid", "stopDateTime": null};
        visitService.getVisitSummary.and.returnValue(specUtil.createFakePromise(visitSummary));

        scope.patient = {uuid: "123"};
        scope.adtObservations = [];
        var response = {
            "results": [{
                "answers": [{"name": {"name": "Undo Discharge", "uuid": "c2bc09b3"}},
                    {"name": {"name": "Admit Patient", "uuid": "avb231rt"}},
                    {"name": {"name": "Discharge Patient", "uuid": "81cecc80"}},
                    {"name": {"name": "Transfer Patient", "uuid": "81d1cf4e"}}]
            }]
        };
        dispositionService.getDispositionActions.and.returnValue(response);
        var stubOnePromise = function (data) {
            return {
                then: function (successFn) {
                    successFn({results: data});
                }
            };
        };
        var stubTwoPromise = function (data) {
            return {
                then: function (successFn) {
                    successFn({results: data});
                }
            };
        };
        var stubSearchPromise = function (data) {
            return {
                then: function (successFunction) {
                    var searchResponse = {
                        results: [{uuid: "visitUuid"}]
                    };
                    return successFunction({data: searchResponse});
                }
            };
        };
        visitService.search.and.callFake(stubSearchPromise);
        visitService.endVisit.and.callFake(stubTwoPromise);
        encounterService.create.and.callFake(stubOnePromise);

        createController();
        expect(scope.dispositionActions).toEqual([{"name": {"name": "Admit Patient", "uuid": "avb231rt"}}]);
    });

    it("Should throw an error message, when the bed is not selected and trying to transfer a patient", function () {
        rootScope.selectedBedInfo = {};
        createController();

        scope.transfer();
        expect(messagingService.showMessage).toHaveBeenCalledWith("error", "SELECT_BED_TO_TRANSFER_MESSAGE");
    });

    it("Should throw an error message, when source and destination beds are same while trying to transfer a patient", function () {
        rootScope.selectedBedInfo = {bed: {bedId: 10}};
        rootScope.bedDetails = {bedId: 10};
        createController();

        scope.transfer();
        expect(messagingService.showMessage).toHaveBeenCalledWith("error", "SELECT_BED_TO_TRANSFER_MESSAGE");
    });

    it("Should show confirmation dialog, when a bed is selected and trying to transfer a patient", function () {
        rootScope.bedDetails = {bedId: 9};
        rootScope.selectedBedInfo = {bed: {bedId: 10}};
        createController();

        scope.transfer();
        expect(ngDialog.openConfirm.calls.count()).toBe(1);
        var args = ngDialog.openConfirm.calls.argsFor(0)[0];
        expect(args.scope).toBe(scope);
        expect(args.template).toBe('views/transferConfirmation.html');
        expect(args.closeByEscape).toBe(true);
        expect(args.className).toBe("ngdialog-theme-default ng-dialog-adt-popUp");
        expect(typeof args.preCloseCallback).toBe('function');
        args.preCloseCallback()
        expect(scope.buttonClicked).toBe(false);
    });

    it("Should create an encounter of type Transfer and assign patient to new bed, On transferConfirmation when the selected bed is still available", function () {
        var bed = { bedId: 4, bedNumber: "402/1"};
        rootScope.selectedBedInfo = {bed : bed};
        bedService.getCompleteBedDetailsByBedId.and.returnValue(specUtil.simplePromise({data: {bed: bed, patients: []}}));

        scope.patient = {uuid: "123"};
        scope.adtObservations = [];
        var encounterCreateResponse = {data: {patientUuid: '123', encounterUuid: "encounterUuid"}};
        translate.instant.and.callFake(function (value) {
            if (value === 'BED') {
                return 'Bed';
            }
            if (value === 'IS_SUCCESSFULLY_ASSIGNED_MESSAGE') {
                return 'is assigned successfully';
            }
            return value;
        });
        encounterService.create.and.returnValue(specUtil.simplePromise(encounterCreateResponse));
        bedService.assignBed.and.returnValue(specUtil.simplePromise({data: {}}));

        createController();

        scope.transferConfirmation();

        var mappedEncounterData = {
            patientUuid: '123',
            encounterTypeUuid: "transferEncounterTypeUuid",
            visitTypeUuid: "visitUuid",
            observations: [],
            locationUuid: 'someLocationUuid'
        };

        expect(bedService.getCompleteBedDetailsByBedId).toHaveBeenCalledWith(rootScope.selectedBedInfo.bed.bedId);
        expect(encounterService.create).toHaveBeenCalledWith(mappedEncounterData);
        expect(bedService.assignBed).toHaveBeenCalledWith(rootScope.selectedBedInfo.bed.bedId, encounterCreateResponse.data.patientUuid, encounterCreateResponse.data.encounterUuid);
        expect(scope.$emit).toHaveBeenCalledWith("event:patientAssignedToBed", rootScope.selectedBedInfo.bed);
        expect(messagingService.showMessage).toHaveBeenCalledWith('info',  "Bed " + rootScope.selectedBedInfo.bed.bedNumber + " is assigned successfully");
        expect(ngDialog.close).toHaveBeenCalled();
    });

    it("should not transfer the patient when the selected bed is already assigned to some other patient", function () {
        var bed = { bedId: 4, "bedName": "402/1"};
        var roomName = "Room1";
        var wardUuid = "wardUuid";
        var wardName = "ward 1";
        rootScope.selectedBedInfo = {bed : bed, roomName: roomName, wardUuid: wardUuid, wardName: wardName};
        var patient = {id: 4, uuid: "someUuid", display: "IQ201 - someName", person: {display: "firstName lastName"}, identifiers: [{identifier: "IQ201"}]};
        bedService.getCompleteBedDetailsByBedId.and.returnValue(specUtil.simplePromise({data: {bed: bed, patients: [patient]}}));
        var stateParams = {
            patientUuid: scope.patient.uuid,
            context: { roomName: roomName, department: { uuid: wardUuid, name: wardName, roomName: roomName }}
        };
        translate.instant.and.returnValue("Please select an available bed. This bed is already assigned to IQ201");

        createController();

        scope.transferConfirmation();

        expect(bedService.getCompleteBedDetailsByBedId).toHaveBeenCalledWith(rootScope.selectedBedInfo.bed.bedId);
        expect(messagingService.showMessage).toHaveBeenCalledWith("error", "Please select an available bed. This bed is already assigned to " + patient.identifiers[0].identifier);
        expect(ngDialog.close).toHaveBeenCalled();
        expect(state.transitionTo).toHaveBeenCalledWith("bedManagement.patient", stateParams, {reload: true, inherit: false, notify: true});
    });

    it("Should throw an error message, when the bed is not selected and trying to discharge the patient", function () {
        rootScope.bedDetails = {};
        createController();

        scope.discharge();
        expect(messagingService.showMessage).toHaveBeenCalledWith("error", "SELECT_BED_TO_DISCHARGE_MESSAGE");
    });

    it("Should show confirmation dialog, when a bed is selected and trying to discharge the patient", function () {
        rootScope.bedDetails = {bedNumber: "202-a"};
        createController();
        var stubSearchPromise = function (data) {
            return {
                then: function (successFunction) {
                    var searchResponse = {
                        results: [{uuid: "visitUuid"}]
                    };
                    return successFunction({data: searchResponse});
                }
            };
        };
        visitService.search.and.callFake(stubSearchPromise);
        scope.discharge();
        expect(ngDialog.openConfirm.calls.count()).toBe(1);
        var args = ngDialog.openConfirm.calls.argsFor(0)[0];
        expect(args.scope).toBe(scope);
        expect(args.template).toBe('views/dischargeConfirmation.html');
        expect(args.closeByEscape).toBe(true);
        expect(args.className).toBe("ngdialog-theme-default ng-dialog-adt-popUp");
        expect(typeof args.preCloseCallback).toBe('function');
        args.preCloseCallback()
        expect(scope.buttonClicked).toBe(false);
    });

    it("Should create an encounter of type Discharge and discharge the patient from the bed, On dischargeConfirmation", function () {
        scope.patient = {uuid: "123"};
        scope.adtObservations = [];
        var encounterCreateResponse = {data: {patientUuid: '123', encounterUuid: "encounterUuid"}, encounterTypeUuid: "dischargeEncounterTypeUuid"};
        encounterService.discharge.and.returnValue(specUtil.simplePromise(encounterCreateResponse));
        visitService.endVisit.and.returnValue({
            then: function (successFn) {
                return;
            }
        });


        createController();

        scope.dischargeConfirmation();

        var mappedEncounterData = {
            patientUuid: '123',
            encounterTypeUuid: "dischargeEncounterTypeUuid",
            visitTypeUuid: undefined,
            observations: [],
            locationUuid: 'someLocationUuid'
        };
        expect(encounterService.discharge).toHaveBeenCalledWith(mappedEncounterData);
    });

    it("should not admit the patient when the bed has patient", function () {
        var bed = { bedId: 4, "bedName": "402/1"};
        rootScope.selectedBedInfo = {bed : bed};
        var roomName = "Room1";
        var wardUuid = "wardUuid";
        var wardName = "ward 1";
        rootScope.selectedBedInfo = {bed : bed, roomName: roomName, wardUuid: wardUuid, wardName: wardName};
        var stateParams = {
            patientUuid: scope.patient.uuid,
            context: { roomName: roomName, department: { uuid: wardUuid, name: wardName, roomName: roomName }}
        };
        var patient = {id: 4, uuid: "someUuid", display: "IQ201 - someName", person: {display: "firstName lastName"}, identifiers: [{identifier: "IQ201"}]};
        bedService.getCompleteBedDetailsByBedId.and.returnValue(specUtil.simplePromise({data: {bed: bed, patients: [patient]}}));
        translate.instant.and.returnValue("Please select an available bed. This bed is already assigned to IQ201");

        createController();

        scope.admitConfirmation();

        expect(bedService.getCompleteBedDetailsByBedId).toHaveBeenCalledWith(rootScope.selectedBedInfo.bed.bedId);
        expect(messagingService.showMessage).toHaveBeenCalledWith("error", "Please select an available bed. This bed is already assigned to " + patient.identifiers[0].identifier);
        expect(ngDialog.close).toHaveBeenCalled();
        expect(state.transitionTo).toHaveBeenCalledWith("bedManagement.patient", stateParams, {reload: true, inherit: false, notify: true});
    });

    it("should admit the patient in the same visit when the bed available and visit type is default visit type", function () {
        var bed = { bedId: 4, bedNumber: "402/1"};
        rootScope.selectedBedInfo = {bed : bed};
        bedService.getCompleteBedDetailsByBedId.and.returnValue(specUtil.simplePromise({data: {bed: bed, patients: []}}));
        bedService.assignBed.and.returnValue(specUtil.simplePromise({data: {}}));
        translate.instant.and.callFake(function (value) {
            if (value === 'BED') {
                return 'Bed';
            }
            if (value === 'IS_SUCCESSFULLY_ASSIGNED_MESSAGE') {
                return 'is assigned successfully';
            }
            return value;
        });

        scope.visitSummary = {"visitType": "IPD", "uuid": "visitUuid"};
        scope.patient = {uuid: "123"};
        scope.adtObservations = [];

        var stubTwoPromise = function(data) {
            return {
                then: function (successFn) {
                    successFn({results: data});
                }
            };
        };

        var encounterResponse = {
            patientUuid: 'patientUuid',
            encounterUuid: "encounterUuid",
            encounterTypeUuid: "admitEncounterTypeUuid",
            visitTypeUuid: "visitUuid",
            observations: [],
            locationUuid: 'someLocationUuid'
        };
        visitService.endVisit.and.callFake(stubTwoPromise);
        encounterService.create.and.returnValue(specUtil.simplePromise({data: encounterResponse}));

        createController();

        scope.admitConfirmation();

        expect(bedService.getCompleteBedDetailsByBedId).toHaveBeenCalledWith(rootScope.selectedBedInfo.bed.bedId);
        expect(encounterService.create).toHaveBeenCalled();
        expect(bedService.assignBed).toHaveBeenCalledWith(rootScope.selectedBedInfo.bed.bedId, "patientUuid", "encounterUuid");
        expect(scope.$emit).toHaveBeenCalledWith("event:patientAssignedToBed", rootScope.selectedBedInfo.bed);
        expect(messagingService.showMessage).toHaveBeenCalledWith('info', "Bed " + rootScope.selectedBedInfo.bed.bedNumber + " is assigned successfully");
        expect(ngDialog.close).toHaveBeenCalled();
    });

    it("should admit the patient and close the current visit and open a new Hospital visit when the bed available and the current visit not of Hospital visit ", function () {
        var bed = { bedId: 4, bedNumber: "402/1"};
        rootScope.selectedBedInfo = {bed : bed};
        bedService.getCompleteBedDetailsByBedId.and.returnValue(specUtil.simplePromise({data: {bed: bed, patients: []}}));
        bedService.assignBed.and.returnValue(specUtil.simplePromise({data: {}}));
        translate.instant.and.callFake(function (value) {
            if (value === 'BED') {
                return 'Bed';
            }
            if (value === 'IS_SUCCESSFULLY_ASSIGNED_MESSAGE') {
                return 'is assigned successfully';
            }
            return value;
        });

        scope.patient = {uuid: "123"};
        scope.adtObservations = [];

        var visitSummary = {"visitType": "Current Visit", "uuid": "visitUuid2", "stopDateTime": null};
        scope.visitSummary = {uuid: "visitUuid"};

        var stubPromise = function (data) {
            return {
                then: function (successFn) {
                    successFn({data: data});
                }
            };
        };

        visitService.getVisitSummary.and.returnValue(specUtil.createFakePromise(visitSummary));
        visitService.endVisitAndCreateEncounter.and.returnValue(specUtil.simplePromise({data: {patientUuid: "patientUuid", encounterUuid: "encounterUuid"}}));
        encounterService.buildEncounter.and.returnValue({encounterUuid: 'uuid'});

        createController();

        scope.admitConfirmation();

        expect(encounterService.buildEncounter).toHaveBeenCalledWith({
            patientUuid: '123',
            encounterTypeUuid: 'admitEncounterTypeUuid',
            visitTypeUuid: 'visitUuid',
            observations: [],
            locationUuid: 'someLocationUuid'
        });
        expect(bedService.getCompleteBedDetailsByBedId).toHaveBeenCalledWith(rootScope.selectedBedInfo.bed.bedId);
        expect(bedService.assignBed).toHaveBeenCalledWith(rootScope.selectedBedInfo.bed.bedId, "patientUuid", "encounterUuid");
        expect(scope.$emit).toHaveBeenCalledWith("event:patientAssignedToBed", rootScope.selectedBedInfo.bed);
        expect(messagingService.showMessage).toHaveBeenCalledWith('info', "Bed " + rootScope.selectedBedInfo.bed.bedNumber + " is assigned successfully");
        expect(scope.visitSummary.visitType).toBe(visitSummary.visitType);
        expect(scope.visitSummary.uuid).toBe(visitSummary.uuid);
        expect(visitService.endVisitAndCreateEncounter).toHaveBeenCalledWith("visitUuid", {encounterUuid: 'uuid'});
        expect(ngDialog.close).toHaveBeenCalled();
    });

    describe("admission and bed assignment sequencing", function () {
        var $q, freeBed, occupiedBed, admission, assignDeferred, occupant;

        var bedDetailsFor = function (patients) {
            return $q.when({data: {patients: patients}});
        };

        var createControllerWithRealPromises = function () {
            consultationPaymentGateService.isServicePaid.and.returnValue($q.when(true));
            createController();
            spinnerService.forPromise.and.callFake(function (promise) {
                return promise;
            });
            // Successful admission and retry scenarios represent a patient who has already paid
            // for the bed. The payment gate is a separate reason Admit can stay disabled.
            scope.bedPaymentConfirmed = true;
        };

        var successMessageCalls = function () {
            return messagingService.showMessage.calls.allArgs().filter(function (args) {
                return args[0] === 'info';
            });
        };

        var forwardCalls = function () {
            return state.transitionTo.calls.allArgs().filter(function (args) {
                return args[1] && args[1].encounterUuid;
            });
        };

        beforeEach(inject(function (_$q_) {
            $q = _$q_;
            freeBed = {bedId: 5, bedNumber: "IPD-0002"};
            occupiedBed = {bedId: 1, bedNumber: "IPD-0001"};
            occupant = {uuid: "occupantUuid", display: "IPD200035 - Test New Paying", identifiers: [{identifier: "IPD200035"}]};
            admission = {patientUuid: "patientUuid", encounterUuid: "admissionEncounterUuid", visitUuid: "ipdVisitUuid"};
            rootScope.selectedBedInfo = {bed: freeBed, roomName: "Room1", wardUuid: "wardUuid", wardName: "ward 1"};
            scope.visitSummary = {"visitType": "IPD", "uuid": "visitUuid"};
            scope.adtObservations = [];
            translate.instant.and.callFake(function (value) {
                return value;
            });
            bedService.getCompleteBedDetailsByBedId.and.callFake(function (bedId) {
                return bedDetailsFor(bedId === occupiedBed.bedId ? [occupant] : []);
            });
            encounterService.create.and.returnValue($q.when({data: admission}));
            assignDeferred = $q.defer();
            bedService.assignBed.and.returnValue(assignDeferred.promise);
        }));

        it("should forward and show the success message only after the bed assignment succeeds", function () {
            createControllerWithRealPromises();
            scope.buttonClicked = true;

            scope.admitConfirmation();
            rootScope.$digest();

            expect(encounterService.create).toHaveBeenCalled();
            expect(bedService.assignBed).toHaveBeenCalledWith(freeBed.bedId, "patientUuid", "admissionEncounterUuid");
            expect(forwardCalls().length).toBe(0);
            expect(scope.$emit).not.toHaveBeenCalledWith("event:patientAssignedToBed", jasmine.any(Object));
            expect(successMessageCalls().length).toBe(0);
            expect(bedQuotationService.cancelReservation).not.toHaveBeenCalled();

            assignDeferred.resolve({data: {}});
            rootScope.$digest();

            expect(freeBed.status).toBe("OCCUPIED");
            expect(scope.$emit).toHaveBeenCalledWith("event:patientAssignedToBed", freeBed);
            expect(messagingService.showMessage).toHaveBeenCalledWith('info', "BED IPD-0002 IS_SUCCESSFULLY_ASSIGNED_MESSAGE");
            expect(bedQuotationService.cancelReservation).toHaveBeenCalledWith(freeBed.bedId, 'Patient admitted');
            expect(scope.$emit).toHaveBeenCalledWith("event:bedReservationChanged");
            expect(forwardCalls().length).toBe(1);
            expect(forwardCalls()[0][1]).toEqual({patientUuid: "patientUuid", encounterUuid: "admissionEncounterUuid", visitUuid: "ipdVisitUuid", bedId: freeBed.bedId});
        });

        it("should not forward or report success, and should restore the Admit button, when bed assignment fails after the admission encounter is created", function () {
            encounterService.delete = jasmine.createSpy('delete');
            createControllerWithRealPromises();
            scope.buttonClicked = true;

            scope.admitConfirmation();
            assignDeferred.reject({status: 403, data: {error: {message: "Privileges required: Edit Admission Locations"}}});
            rootScope.$digest();

            expect(encounterService.create.calls.count()).toBe(1);
            expect(forwardCalls().length).toBe(0);
            expect(successMessageCalls().length).toBe(0);
            expect(scope.$emit).not.toHaveBeenCalledWith("event:patientAssignedToBed", jasmine.any(Object));
            expect(freeBed.status).toBeUndefined();
            expect(messagingService.showMessage).toHaveBeenCalledWith("error", "BED_ASSIGNMENT_FAILED_AFTER_ADMISSION_MESSAGE");
            expect(scope.buttonClicked).toBe(false);
            expect(bedQuotationService.cancelReservation).not.toHaveBeenCalled();
            rootScope.patient = {uuid: "patientUuid"};
            rootScope.bedDetails = undefined;
            expect(scope.bedPaymentConfirmed).toBe(true);
            expect(scope.disableAdmitButton()).toBe(false);
            expect(encounterService.delete).not.toHaveBeenCalled();
        });

        it("should retry the bed assignment against the existing admission encounter instead of creating another admission", function () {
            createControllerWithRealPromises();
            scope.admitConfirmation();
            assignDeferred.reject({status: 500});
            rootScope.$digest();

            var anotherFreeBed = {bedId: 6, bedNumber: "IPD-0003"};
            rootScope.selectedBedInfo.bed = anotherFreeBed;
            bedService.assignBed.and.returnValue($q.when({data: {}}));
            scope.admit();
            scope.admitConfirmation();
            rootScope.$digest();

            expect(encounterService.create.calls.count()).toBe(1);
            expect(bedService.assignBed.calls.mostRecent().args).toEqual([anotherFreeBed.bedId, "patientUuid", "admissionEncounterUuid"]);
            expect(scope.$emit).toHaveBeenCalledWith("event:patientAssignedToBed", anotherFreeBed);
            expect(bedQuotationService.cancelReservation.calls.count()).toBe(1);
            expect(bedQuotationService.cancelReservation).toHaveBeenCalledWith(anotherFreeBed.bedId, 'Patient admitted');
            expect(forwardCalls().length).toBe(1);
        });

        it("should not create an admission encounter, should reset buttonClicked and allow retry with a free bed when the selected bed is occupied", function () {
            createControllerWithRealPromises();
            rootScope.selectedBedInfo.bed = occupiedBed;
            scope.admit();
            expect(scope.buttonClicked).toBe(true);

            scope.admitConfirmation();
            rootScope.$digest();

            expect(encounterService.create).not.toHaveBeenCalled();
            expect(bedService.assignBed).not.toHaveBeenCalled();
            expect(messagingService.showMessage).toHaveBeenCalledWith('error', "SELECT_AVAILABLE_BED_DEFAULT_MESSAGE");
            expect(scope.buttonClicked).toBe(false);
            expect(bedQuotationService.cancelReservation).not.toHaveBeenCalled();

            rootScope.selectedBedInfo.bed = freeBed;
            rootScope.patient = {uuid: "patientUuid"};
            rootScope.bedDetails = undefined;
            expect(scope.bedPaymentConfirmed).toBe(true);
            expect(scope.disableAdmitButton()).toBe(false);

            scope.admit();
            scope.admitConfirmation();
            assignDeferred.resolve({data: {}});
            rootScope.$digest();

            expect(encounterService.create.calls.count()).toBe(1);
            expect(bedService.assignBed).toHaveBeenCalledWith(freeBed.bedId, "patientUuid", "admissionEncounterUuid");
            expect(forwardCalls().length).toBe(1);
        });

        it("should reset buttonClicked when the bed availability check itself fails", function () {
            bedService.getCompleteBedDetailsByBedId.and.returnValue($q.reject({status: 500}));
            createControllerWithRealPromises();
            scope.buttonClicked = true;

            scope.admitConfirmation();
            rootScope.$digest();

            expect(encounterService.create).not.toHaveBeenCalled();
            expect(scope.buttonClicked).toBe(false);
        });

        it("should reset buttonClicked and not assign a bed when the admission encounter cannot be created", function () {
            encounterService.create.and.returnValue($q.reject({status: 500}));
            createControllerWithRealPromises();
            scope.buttonClicked = true;

            scope.admitConfirmation();
            rootScope.$digest();

            expect(bedService.assignBed).not.toHaveBeenCalled();
            expect(forwardCalls().length).toBe(0);
            expect(scope.buttonClicked).toBe(false);
        });

        describe("OPD to IPD visit conversion", function () {
            beforeEach(function () {
                scope.visitSummary = {"visitType": "Current Visit", "uuid": "opdVisitUuid"};
                encounterService.buildEncounter.and.returnValue({encounterUuid: 'built'});
                visitService.endVisitAndCreateEncounter.and.returnValue($q.when({data: admission}));
                visitService.getVisitSummary.and.returnValue($q.when({data: {visitType: "IPD", uuid: "ipdVisitUuid"}}));
            });

            it("should forward only after the bed assignment succeeds", function () {
                createControllerWithRealPromises();

                scope.admitConfirmation();
                rootScope.$digest();

                expect(visitService.endVisitAndCreateEncounter).toHaveBeenCalledWith("opdVisitUuid", {encounterUuid: 'built'});
                expect(bedService.assignBed).toHaveBeenCalledWith(freeBed.bedId, "patientUuid", "admissionEncounterUuid");
                expect(forwardCalls().length).toBe(0);
                expect(successMessageCalls().length).toBe(0);
                expect(bedQuotationService.cancelReservation).not.toHaveBeenCalled();

                assignDeferred.resolve({data: {}});
                rootScope.$digest();

                expect(scope.$emit).toHaveBeenCalledWith("event:patientAssignedToBed", freeBed);
                expect(successMessageCalls().length).toBe(1);
                expect(bedQuotationService.cancelReservation).toHaveBeenCalledWith(freeBed.bedId, 'Patient admitted');
                expect(forwardCalls().length).toBe(1);
            });

            it("should not forward, should restore the Admit button, and should retry without ending the visit again when bed assignment fails", function () {
                createControllerWithRealPromises();
                scope.buttonClicked = true;

                scope.admitConfirmation();
                assignDeferred.reject({status: 403});
                rootScope.$digest();

                expect(forwardCalls().length).toBe(0);
                expect(successMessageCalls().length).toBe(0);
                expect(messagingService.showMessage).toHaveBeenCalledWith("error", "BED_ASSIGNMENT_FAILED_AFTER_ADMISSION_MESSAGE");
                expect(scope.buttonClicked).toBe(false);
                expect(bedQuotationService.cancelReservation).not.toHaveBeenCalled();

                bedService.assignBed.and.returnValue($q.when({data: {}}));
                scope.visitSummary = {"visitType": "Current Visit", "uuid": "opdVisitUuid"};
                scope.closeCurrentVisitAndStartNewVisit();
                rootScope.$digest();

                expect(visitService.endVisitAndCreateEncounter.calls.count()).toBe(1);
                expect(encounterService.create).not.toHaveBeenCalled();
                expect(bedService.assignBed.calls.count()).toBe(2);
                expect(bedService.assignBed.calls.mostRecent().args).toEqual([freeBed.bedId, "patientUuid", "admissionEncounterUuid"]);
                expect(bedQuotationService.cancelReservation.calls.count()).toBe(1);
                expect(bedQuotationService.cancelReservation).toHaveBeenCalledWith(freeBed.bedId, 'Patient admitted');
                expect(forwardCalls().length).toBe(1);
            });

            it("should reset buttonClicked and not assign a bed when ending the visit fails", function () {
                visitService.endVisitAndCreateEncounter.and.returnValue($q.reject({status: 500}));
                createControllerWithRealPromises();
                scope.buttonClicked = true;

                scope.admitConfirmation();
                rootScope.$digest();

                expect(bedService.assignBed).not.toHaveBeenCalled();
                expect(forwardCalls().length).toBe(0);
                expect(scope.buttonClicked).toBe(false);
            });
        });

        it("should keep the existing transfer behaviour of assigning the bed, closing the dialog and forwarding", function () {
            rootScope.bedDetails = {bedId: 9};
            encounterService.create.and.returnValue($q.when({data: {patientUuid: "patientUuid", encounterUuid: "transferEncounterUuid"}}));
            createControllerWithRealPromises();

            scope.transferConfirmation();
            assignDeferred.resolve({data: {}});
            rootScope.$digest();

            expect(bedService.assignBed).toHaveBeenCalledWith(freeBed.bedId, "patientUuid", "transferEncounterUuid");
            expect(scope.$emit).toHaveBeenCalledWith("event:patientAssignedToBed", freeBed);
            expect(bedQuotationService.cancelReservation).toHaveBeenCalledWith(freeBed.bedId, 'Patient admitted');
            expect(ngDialog.close).toHaveBeenCalled();
            expect(forwardCalls().length).toBe(1);
        });

        it("should keep Admit disabled when bed payment is not confirmed even after buttonClicked is reset", function () {
            createControllerWithRealPromises();
            scope.bedPaymentConfirmed = false;
            consultationPaymentGateService.isServicePaid.and.returnValue($q.when(false));
            rootScope.patient = {uuid: "patientUuid"};
            rootScope.bedDetails = undefined;
            scope.buttonClicked = false;

            expect(scope.disableAdmitButton()).toBe(true);

            rootScope.selectedBedInfo.bed = occupiedBed;
            scope.admit();
            expect(scope.buttonClicked).toBe(true);

            scope.admitConfirmation();
            rootScope.$digest();

            expect(encounterService.create).not.toHaveBeenCalled();
            expect(scope.buttonClicked).toBe(false);
            expect(scope.bedPaymentConfirmed).toBe(false);
            expect(scope.disableAdmitButton()).toBe(true);
        });
    });
});
