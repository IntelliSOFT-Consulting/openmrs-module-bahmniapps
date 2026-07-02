"use strict";

angular.module('bahmni.ipd')
    .controller('AdtController', ['$scope', '$q', '$rootScope', 'spinner', 'dispositionService',
        'encounterService', 'bedService', 'appService', 'visitService', '$location', '$window', 'sessionService',
        'messagingService', '$anchorScroll', '$stateParams', 'ngDialog', '$filter', '$state', '$translate',
        'bedQuotationService', 'consultationPaymentGateService', 'observationsService',
        function ($scope, $q, $rootScope, spinner, dispositionService, encounterService, bedService,
                  appService, visitService, $location, $window, sessionService, messagingService, $anchorScroll,
                  $stateParams, ngDialog, $filter, $state, $translate,
                  bedQuotationService, consultationPaymentGateService, observationsService) {
            var actionConfigs = {};
            var encounterConfig = $rootScope.encounterConfig;
            var locationUuid = sessionService.getLoginLocationUuid();
            var visitTypes = encounterConfig.getVisitTypes();
            var customVisitParams = Bahmni.IPD.Constants.visitRepresentation;
            $scope.assignBedsPrivilege = Bahmni.IPD.Constants.assignBedsPrivilege;
            $scope.defaultVisitTypeName = appService.getAppDescriptor().getConfigValue('defaultVisitType');
            var hideStartNewVisitPopUp = appService.getAppDescriptor().getConfigValue('hideStartNewVisitPopUp');
            $scope.adtObservations = [];
            $scope.dashboardConfig = appService.getAppDescriptor().getConfigValue('dashboard');
            $scope.expectedDateOfDischargeConceptName = appService.getAppDescriptor().getConfigValue('expectedDateOfDischarge') || "";
            $scope.getAdtConceptConfig = $scope.dashboardConfig.conceptName;
            $scope.editMode = false;
            $scope.buttonClicked = false;
            $scope.enableAutoConvertToIPDVisit = appService.getAppDescriptor().getConfigValue('enableAutoConvertToIPDVisit') || false;

            var getVisitTypeUuid = function (visitTypeName) {
                var visitType = _.find(visitTypes, {name: visitTypeName});
                return (visitType && visitType.uuid) || null;
            };

            var defaultVisitTypeUuid = getVisitTypeUuid($scope.defaultVisitTypeName);

            var getCurrentVisitTypeUuid = function () {
                if ($scope.visitSummary && $scope.visitSummary.dateCompleted === null) {
                    return getVisitTypeUuid($scope.visitSummary.visitType);
                }
                return defaultVisitTypeUuid;
            };

            var initializeActionConfig = function () {
                var admitActions = appService.getAppDescriptor().getExtensions("org.bahmni.ipd.admit.action", "config");
                var transferActions = appService.getAppDescriptor().getExtensions("org.bahmni.ipd.transfer.action", "config");
                var dischargeActions = appService.getAppDescriptor().getExtensions("org.bahmni.ipd.discharge.action", "config");
                var undoDischargeActions = appService.getAppDescriptor().getExtensions("org.bahmni.ipd.undo.discharge.action", "config");
                if (encounterConfig) {
                    var Constants = Bahmni.Common.Constants;
                    actionConfigs[Constants.admissionCode] = {
                        encounterTypeUuid: encounterConfig.getAdmissionEncounterTypeUuid(),
                        allowedActions: admitActions
                    };
                    actionConfigs[Constants.dischargeCode] = {
                        encounterTypeUuid: encounterConfig.getDischargeEncounterTypeUuid(),
                        allowedActions: dischargeActions
                    };
                    actionConfigs[Constants.transferCode] = {
                        encounterTypeUuid: encounterConfig.getTransferEncounterTypeUuid(),
                        allowedActions: transferActions
                    };
                    actionConfigs[Constants.undoDischargeCode] = {
                        encounterTypeUuid: encounterConfig.getDischargeEncounterTypeUuid(),
                        allowedActions: undoDischargeActions
                    };
                }
            };

            var filterAction = function (actions, actionTypes) {
                return _.filter(actions, function (action) {
                    return actionTypes.indexOf(action.name.name) >= 0;
                });
            };

            var getDispositionActions = function (actions) {
                var visitSummary = $scope.visitSummary;
                var stopDate = visitSummary && visitSummary.stopDateTime;
                var isVisitOpen = (stopDate === null);
                if (visitSummary && visitSummary.isDischarged() && isVisitOpen) {
                    return filterAction(actions, ["Undo Discharge"]);
                } else if (visitSummary && visitSummary.isAdmitted() && isVisitOpen) {
                    return filterAction(actions, ["Transfer Patient", "Discharge Patient"]);
                } else {
                    return filterAction(actions, ["Admit Patient"]);
                }
            };

            var getPatientSpecificActiveVisits = function (response) {
                var currentActiveVisit = _.last(response.data.results);
                return currentActiveVisit ? currentActiveVisit.uuid : null;
            };

            var getVisit = function () {
                var getNoVisitPromise = function () {
                    $scope.visitSummary = null;
                    return $q.when({id: 1, status: "Returned from service.", promiseComplete: true});
                };
                if ($scope.patient) {
                    return visitService.search({patient: $scope.patient.uuid, v: customVisitParams, includeInactive: false}).then(function (visitsResponse) {
                        var visitUuid = getPatientSpecificActiveVisits(visitsResponse);
                        if (visitUuid) {
                            return visitService.getVisitSummary(visitUuid).then(function (response) {
                                $scope.visitSummary = new Bahmni.Common.VisitSummary(response.data);
                            });
                        } else {
                            return getNoVisitPromise();
                        }
                    });
                } else {
                    return getNoVisitPromise();
                }
            };

            $scope.showAdtButtons = function () {
                return $state.current.name === "bedManagement.patient" && !$scope.editMode;
            };

            // Bed payment gate — same mechanism as the CONSULTATION queue gate
            // (consultationPaymentGateService), just for serviceType 'BED'. Patient/visit scoped,
            // not bed-scoped: a patient can only meaningfully hold one active bed quotation per
            // visit, so "is BED paid for this visit" is the right granularity, matching how the
            // CONSULTATION gate already works.
            $scope.bedPaymentConfirmed = false;

            var checkBedPaymentStatus = function () {
                if (!$scope.patient || !$scope.visitSummary || !$scope.visitSummary.uuid) {
                    $scope.bedPaymentConfirmed = false;
                    return $q.when(false);
                }
                return consultationPaymentGateService.isServicePaid($scope.patient.uuid, $scope.visitSummary.uuid, 'BED')
                    .then(function (paid) {
                        $scope.bedPaymentConfirmed = paid;
                        return paid;
                    });
            };

            // The single bed (if any) this patient currently holds an active reservation for —
            // shared via $rootScope so RoomGridController (a sibling controller on this same
            // admission screen) can detect "clinician selected a different bed than the one
            // already paid for" without a per-click HTTP round trip.
            var refreshPatientActiveBedReservation = function () {
                if (!$scope.patient || !$scope.patient.identifier) {
                    $rootScope.patientActiveBedReservation = null;
                    return $q.when(null);
                }
                return bedQuotationService.getActivePatientReservation($scope.patient.identifier).then(function (response) {
                    var data = response.data;
                    $rootScope.patientActiveBedReservation = (data && data.found) ? data : null;
                    return $rootScope.patientActiveBedReservation;
                }, function () {
                    $rootScope.patientActiveBedReservation = null;
                    return null;
                });
            };

            var init = function () {
                initializeActionConfig();
                $scope.encounterConfig = $scope.$parent.encounterConfig;
                $scope.currentVisitTypeUuid = getCurrentVisitTypeUuid();
                var defaultVisitType = appService.getAppDescriptor().getConfigValue('defaultVisitType');
                var visitTypes = encounterConfig.getVisitTypes();
                $scope.visitControl = new Bahmni.Common.VisitControl(visitTypes, defaultVisitType, visitService);
                $scope.dashboard = Bahmni.Common.DisplayControl.Dashboard.create($scope.dashboardConfig || {}, $filter);
                $scope.sectionGroups = $scope.dashboard.getSections($scope.diseaseTemplates);
                return getVisit().then(dispositionService.getDispositionActions).then(function (response) {
                    if (response.data && response.data.results && response.data.results.length) {
                        $scope.dispositionActions = getDispositionActions(response.data.results[0].answers);
                        if ($scope.visitSummary) {
                            $scope.currentVisitType = $scope.visitSummary.visitType;
                        }
                    }
                    checkBedPaymentStatus();
                    refreshPatientActiveBedReservation();
                });
            };

            $scope.$on("event:bedReservationChanged", function () {
                checkBedPaymentStatus();
                refreshPatientActiveBedReservation();
            });

            var getEncounterData = function (encounterTypeUuid, visitTypeUuid) {
                var encounterData = {};
                encounterData.patientUuid = $scope.patient.uuid;
                encounterData.encounterTypeUuid = encounterTypeUuid;
                encounterData.visitTypeUuid = visitTypeUuid;
                encounterData.observations = $scope.adtObservations;
                encounterData.observations = _.filter(encounterData.observations, function (observation) {
                    return !_.isEmpty(observation.value);
                });
                encounterData.locationUuid = locationUuid;
                return encounterData;
            };

            var forwardUrl = function (response, option) {
                var appDescriptor = appService.getAppDescriptor();
                var forwardLink = appDescriptor.getConfig(option);
                forwardLink = forwardLink && forwardLink.value;

                var bedId = _.get($rootScope.bedDetails, 'bedId') || _.get($rootScope.selectedBedInfo, 'bed.bedId');
                var options = {
                    'patientUuid': $scope.patient.uuid,
                    'encounterUuid': response.encounterUuid,
                    'visitUuid': response.visitUuid,
                    'bedId': bedId
                };
                if (forwardLink) {
                    $state.transitionTo("bedManagement.patient", options, {
                        reload: true, inherit: false, notify: true
                    });
                }
            };

            var createEncounterAndContinue = function () {
                var currentVisitTypeUuid = getCurrentVisitTypeUuid();
                if (currentVisitTypeUuid !== null) {
                    var encounterData = getEncounterData($scope.encounterConfig.getAdmissionEncounterTypeUuid(), currentVisitTypeUuid);
                    return spinner.forPromise(encounterService.create(encounterData).then(function (response) {
                        if ($scope.visitSummary === null) {
                            visitService.getVisitSummary(response.data.visitUuid).then(function (response) {
                                $scope.visitSummary = new Bahmni.Common.VisitSummary(response.data);
                            });
                        }
                        assignBedToPatient($rootScope.selectedBedInfo.bed, response.data.patientUuid, response.data.encounterUuid);
                        forwardUrl(response.data, "onAdmissionForwardTo");
                    }));
                } else if ($scope.defaultVisitTypeName === null) {
                    messagingService.showMessage("error", "MESSAGE_DEFAULT_VISIT_TYPE_NOT_FOUND_KEY");
                } else {
                    messagingService.showMessage("error", "MESSAGE_DEFAULT_VISIT_TYPE_INVALID_KEY");
                }
                return $q.when({});
            };

            var assignBedToPatient = function (bed, patientUuid, encounterUuid) {
                spinner.forPromise(bedService.assignBed(bed.bedId, patientUuid, encounterUuid).then(function () {
                    bed.status = "OCCUPIED";
                    $scope.$emit("event:patientAssignedToBed", $rootScope.selectedBedInfo.bed);
                    messagingService.showMessage("info", $translate.instant("BED") + " " + bed.bedNumber + " " + $translate.instant("IS_SUCCESSFULLY_ASSIGNED_MESSAGE"));
                    // The bed has moved past "reserved, awaiting admission" now that the patient is
                    // actually admitted — release the reservation record so the ward/room-level
                    // indicators don't keep pointing at a bed that's already done. Best-effort:
                    // there may be no reservation to clear (e.g. admitted without ever using
                    // Submit Quotation), so a failure here is expected and must not be surfaced.
                    bedQuotationService.cancelReservation(bed.bedId, 'Patient admitted').finally(function () {
                        $scope.$emit("event:bedReservationChanged");
                    });
                }));
            };

            var setButtonClicked = function () {
                $scope.buttonClicked = true;
            };

            var unsetButtonClicked = function () {
                $scope.buttonClicked = false;
            };

            $scope.admit = function () {
                setButtonClicked();
                if (angular.isUndefined($rootScope.selectedBedInfo.bed)) {
                    messagingService.showMessage("error", "SELECT_BED_TO_ADMIT_PATIENT_DEFAULT_MESSAGE");
                    unsetButtonClicked();
                } else if ($scope.visitSummary && $scope.visitSummary.visitType !== $scope.defaultVisitTypeName && !hideStartNewVisitPopUp) {
                    if ($scope.enableAutoConvertToIPDVisit) {
                        messagingService.showMessage("info", $translate.instant("MESSAGE_AUTO_CONVERT_TO_IPD_VISIT", {visitType: $scope.defaultVisitTypeName}));
                        $scope.closeCurrentVisitAndStartNewVisit();
                    } else {
                        ngDialog.openConfirm({
                            template: 'views/visitChangeConfirmation.html',
                            scope: $scope,
                            closeByEscape: true,
                            preCloseCallback: unsetButtonClicked
                        });
                    }
                } else {
                    ngDialog.openConfirm({
                        template: 'views/admitConfirmation.html',
                        scope: $scope,
                        closeByEscape: true,
                        className: "ngdialog-theme-default ng-dialog-adt-popUp",
                        preCloseCallback: unsetButtonClicked
                    });
                }
                return $q.when({});
            };

            $scope.cancelConfirmationDialog = function () {
                ngDialog.close();
            };

            $scope.closeCurrentVisitAndStartNewVisit = function () {
                if (defaultVisitTypeUuid !== null) {
                    var encounter = getEncounterData($scope.encounterConfig.getAdmissionEncounterTypeUuid(), defaultVisitTypeUuid);
                    spinner.forPromise(visitService.endVisitAndCreateEncounter($scope.visitSummary.uuid, encounterService.buildEncounter(encounter)).then(function (response) {
                        spinner.forPromise(visitService.getVisitSummary(response.data.visitUuid).then(function (response) {
                            $scope.visitSummary = new Bahmni.Common.VisitSummary(response.data);
                        }));
                        assignBedToPatient($rootScope.selectedBedInfo.bed, response.data.patientUuid, response.data.encounterUuid);
                        forwardUrl(response.data, "onAdmissionForwardTo");
                    }));
                } else if ($scope.defaultVisitTypeName === null) {
                    messagingService.showMessage("error", "MESSAGE_DEFAULT_VISIT_TYPE_NOT_FOUND_KEY");
                } else {
                    messagingService.showMessage("error", "MESSAGE_DEFAULT_VISIT_TYPE_INVALID_KEY");
                }
                ngDialog.close();
                return $q.when({});
            };

            $scope.continueWithCurrentVisit = function () {
                createEncounterAndContinue();
                ngDialog.close();
            };

            spinner.forPromise(init());

            $scope.disableAdmitButton = function () {
                return (!($rootScope.patient && !$rootScope.bedDetails)) || $scope.buttonClicked || !$scope.bedPaymentConfirmed;
            };

            $scope.disableSubmitQuotationButton = function () {
                return (!($rootScope.patient && !$rootScope.bedDetails)) || $scope.buttonClicked;
            };

            // ---------- Submit Quotation (raises the bed-nights sale order in Odoo) ----------

            // A coded-concept obs (e.g. "Payment Method"/"Mode of Payment") returns the full
            // concept-answer object as .value, not a plain string — same extraction logic as
            // registration/controllers/visitController.js's submitFeeToOdoo flow.
            var extractObsValue = function (obs) {
                if (!obs) { return null; }
                var val = obs.value;
                if (!val) { return null; }
                if (typeof val !== 'object') { return val; }
                var nameVal = val.name || val.display;
                if (nameVal && typeof nameVal === 'object') {
                    return nameVal.name || nameVal.display || null;
                }
                return nameVal || null;
            };

            var buildQuotationPayload = function () {
                var bed = $rootScope.selectedBedInfo.bed;
                var now = new Date().toISOString();
                return {
                    patientId: $scope.patient.identifier,
                    patientUuid: $scope.patient.uuid,
                    visitUuid: $scope.visitSummary.uuid,
                    bedId: bed.bedId,
                    bedNumber: bed.bedNumber,
                    wardUuid: $rootScope.selectedBedInfo.wardUuid,
                    roomName: $rootScope.selectedBedInfo.roomName,
                    numberOfNights: $scope.quotation.numberOfNights,
                    paymentMethod: $scope.quotation.paymentMethod,
                    modeOfPayment: $scope.quotation.modeOfPayment,
                    voided: false,
                    dateCreated: now,
                    dateChanged: now,
                    createdBy: $rootScope.currentUser && $rootScope.currentUser.username
                };
            };

            var openQuotationDialog = function () {
                ngDialog.openConfirm({
                    template: 'views/submitQuotationConfirmation.html',
                    scope: $scope,
                    closeByEscape: true,
                    className: "ngdialog-theme-default ng-dialog-adt-popUp",
                    preCloseCallback: unsetButtonClicked
                });
            };

            $scope.submitQuotation = function () {
                setButtonClicked();
                if (angular.isUndefined($rootScope.selectedBedInfo.bed)) {
                    messagingService.showMessage("error", "SELECT_BED_TO_ADMIT_PATIENT_DEFAULT_MESSAGE");
                    unsetButtonClicked();
                    return;
                }
                if (!$scope.visitSummary || !$scope.visitSummary.uuid) {
                    messagingService.showMessage("error", "NO_ACTIVE_VISIT_MESSAGE");
                    unsetButtonClicked();
                    return;
                }

                $scope.quotation = {numberOfNights: null, paymentMethod: null, modeOfPayment: null};

                spinner.forPromise(
                    observationsService.fetch(null, ['Payment Method', 'Mode of Payment'], 'latest', null, $scope.visitSummary.uuid)
                        .then(function (response) {
                            var obs = response.data || [];
                            var paymentMethodObs = _.find(obs, function (o) {
                                return o.concept && o.concept.name === 'Payment Method';
                            });
                            var modeOfPaymentObs = _.find(obs, function (o) {
                                return o.concept && o.concept.name === 'Mode of Payment';
                            });
                            var paymentMethod = extractObsValue(paymentMethodObs);
                            var modeOfPayment = extractObsValue(modeOfPaymentObs);
                            // Normalise to lowercase so Odoo's case-sensitive validation passes
                            // (e.g. "Cash" -> "cash") — same as the registration consultation-fee flow.
                            if (angular.isString(paymentMethod)) { paymentMethod = paymentMethod.toLowerCase(); }
                            if (angular.isString(modeOfPayment)) { modeOfPayment = modeOfPayment.toLowerCase(); }
                            $scope.quotation.paymentMethod = paymentMethod;
                            $scope.quotation.modeOfPayment = modeOfPayment;
                            // Only ask the user for these if we genuinely found nothing recorded at
                            // registration — the popup otherwise only asks for number of nights,
                            // per spec.
                            $scope.quotationNeedsPaymentFields = !$scope.quotation.paymentMethod || !$scope.quotation.modeOfPayment;
                            openQuotationDialog();
                        }, function () {
                            // Obs lookup failing shouldn't block raising a quotation — just fall
                            // back to asking for the payment fields in the popup.
                            $scope.quotationNeedsPaymentFields = true;
                            openQuotationDialog();
                        })
                );
            };

            $scope.submitQuotationConfirmation = function () {
                var bed = $rootScope.selectedBedInfo.bed;
                var payload = buildQuotationPayload();

                spinner.forPromise(
                    bedQuotationService.submitQuotation(payload).then(function (response) {
                        var data = response.data;
                        ngDialog.close();
                        unsetButtonClicked();
                        if (data && data.status === 'success') {
                            messagingService.showMessage('info', bed.bedNumber + ' ' + $translate.instant("BED_QUOTATION_SUBMITTED_MESSAGE"));
                            $scope.$emit("event:bedReservationChanged");
                            checkBedPaymentStatus();
                        } else {
                            messagingService.showMessage('error', (data && data.message) || $translate.instant("BED_QUOTATION_FAILED_MESSAGE"));
                        }
                    }, function () {
                        unsetButtonClicked();
                        messagingService.showMessage('error', $translate.instant("BED_QUOTATION_FAILED_MESSAGE"));
                    })
                );
            };

            // ---------- Paid-bed mismatch (clinician selects a different bed than the one the
            // patient already paid for) ----------

            $scope.$on("event:bedSelectedWithPaidMismatch", function (event, payload) {
                $scope.pendingBedSwitch = payload; // {newBed, existingReservation}
                setButtonClicked();
                ngDialog.openConfirm({
                    template: 'views/bedSwitchConfirmation.html',
                    scope: $scope,
                    closeByEscape: true,
                    className: "ngdialog-theme-default ng-dialog-adt-popUp",
                    preCloseCallback: function () {
                        $scope.pendingBedSwitch = null;
                        unsetButtonClicked();
                    }
                });
            });

            // "Yes" — cancel the previous (paid) bed booking, select the newly clicked bed, and
            // automatically re-run the standard Submit Quotation flow for it.
            $scope.confirmBedSwitchAndRebook = function () {
                var pending = $scope.pendingBedSwitch;
                ngDialog.close();
                if (!pending) {
                    unsetButtonClicked();
                    return;
                }
                var oldBed = pending.existingReservation;
                spinner.forPromise(
                    bedQuotationService.cancelReservation(oldBed.bedId, 'Bed switched after payment — clinician confirmed').then(function () {
                        messagingService.showMessage('info', (oldBed.bedNumber || '') + ' ' + $translate.instant("BED_RESERVATION_CANCELLED_MESSAGE"));
                        $rootScope.selectedBedInfo.bed = pending.newBed;
                        $scope.pendingBedSwitch = null;
                        $scope.$emit("event:bedReservationChanged");
                        unsetButtonClicked();
                        $scope.submitQuotation();
                    }, function () {
                        $scope.pendingBedSwitch = null;
                        unsetButtonClicked();
                        messagingService.showMessage('error', $translate.instant("BED_RESERVATION_CANCEL_FAILED_MESSAGE"));
                    })
                );
            };

            // "Cancel the reservation" — releases the previously paid bed without selecting the
            // newly clicked one. The patient keeps no active bed reservation until the clinician
            // explicitly picks a bed again.
            $scope.cancelPaidBedReservation = function () {
                var pending = $scope.pendingBedSwitch;
                ngDialog.close();
                if (!pending) {
                    unsetButtonClicked();
                    return;
                }
                var oldBed = pending.existingReservation;
                spinner.forPromise(
                    bedQuotationService.cancelReservation(oldBed.bedId, 'Cancelled by clinician — bed was already paid for').then(function () {
                        messagingService.showMessage('warning', (oldBed.bedNumber || '') + ' ' + $translate.instant("BED_RESERVATION_CANCELLED_BUT_PAID_MESSAGE"));
                        $scope.pendingBedSwitch = null;
                        $scope.$emit("event:bedReservationChanged");
                        unsetButtonClicked();
                    }, function () {
                        $scope.pendingBedSwitch = null;
                        unsetButtonClicked();
                        messagingService.showMessage('error', $translate.instant("BED_RESERVATION_CANCEL_FAILED_MESSAGE"));
                    })
                );
            };

            $scope.disableTransfer = function () {
                return (!($rootScope.patient && $rootScope.bedDetails && !isCurrentPatientPresentOnSelectedBed())) || $scope.buttonClicked;
            };

            var isCurrentPatientPresentOnSelectedBed = function () {
                if ($rootScope.selectedBedInfo.bed) {
                    return $rootScope.selectedBedInfo.bed.bedId === $rootScope.bedDetails.bedId;
                }
                return false;
            };
            $scope.disableDischargeButton = function () {
                return (!($rootScope.patient && $rootScope.bedDetails && isCurrentPatientPresentOnSelectedBed())) || $scope.buttonClicked;
            };

            $scope.transfer = function () {
                setButtonClicked();
                if (angular.isUndefined($rootScope.selectedBedInfo.bed) || $rootScope.selectedBedInfo.bed.bedId === $rootScope.bedDetails.bedId) {
                    messagingService.showMessage("error", "SELECT_BED_TO_TRANSFER_MESSAGE");
                } else {
                    ngDialog.openConfirm({
                        template: 'views/transferConfirmation.html',
                        scope: $scope,
                        closeByEscape: true,
                        className: "ngdialog-theme-default ng-dialog-adt-popUp",
                        preCloseCallback: unsetButtonClicked
                    });
                }
            };

            var reloadStateWithContextParams = function () {
                var selectedBedInfo = $rootScope.selectedBedInfo;
                var options = {
                    patientUuid: $scope.patient.uuid,
                    context: {
                        roomName: selectedBedInfo.roomName,
                        department: {
                            uuid: selectedBedInfo.wardUuid,
                            name: selectedBedInfo.wardName,
                            roomName: selectedBedInfo.roomName
                        }
                    }
                };
                $state.transitionTo("bedManagement.patient", options, {
                    reload: true, inherit: false, notify: true
                });
            };

            var disableButton = function () {
                $scope.isDisabled = true;
            };

            $scope.transferConfirmation = function () {
                var encounterData = getEncounterData($scope.encounterConfig.getTransferEncounterTypeUuid(), getCurrentVisitTypeUuid());
                disableButton();
                spinner.forPromise(bedService.getCompleteBedDetailsByBedId($rootScope.selectedBedInfo.bed.bedId).then(function (response) {
                    var bedDetails = response.data;
                    if (!bedDetails.patients.length) {
                        spinner.forPromise(encounterService.create(encounterData).then(function (response) {
                            assignBedToPatient($rootScope.selectedBedInfo.bed, response.data.patientUuid, response.data.encounterUuid);
                            ngDialog.close();
                            forwardUrl(response.data, "onTransferForwardTo");
                        }));
                    } else {
                        showErrorMessage(bedDetails);
                        reloadStateWithContextParams();
                    }
                }));
            };

            $scope.discharge = function () {
                setButtonClicked();
                if (!$rootScope.bedDetails.bedNumber) {
                    messagingService.showMessage("error", "SELECT_BED_TO_DISCHARGE_MESSAGE");
                } else {
                    visitService.search({patient: $scope.patient.uuid, v: customVisitParams, includeInactive: false}).then(function (visitResponse) {
                        var visitUuid = getPatientSpecificActiveVisits(visitResponse);
                        if (!visitUuid) {
                            messagingService.showMessage("error", "NO_ACTIVE_VISIT_MESSAGE");
                        } else {
                            ngDialog.openConfirm({
                                template: 'views/dischargeConfirmation.html',
                                scope: $scope,
                                closeByEscape: true,
                                className: "ngdialog-theme-default ng-dialog-adt-popUp",
                                preCloseCallback: unsetButtonClicked
                            });
                        }
                    });
                }
            };

            $scope.dischargeConfirmation = function () {
                var encounterData = getEncounterData($scope.encounterConfig.getDischargeEncounterTypeUuid());
                return spinner.forPromise(encounterService.discharge(encounterData).then(function (response) {
                    ngDialog.close();
                    forwardUrl(response.data, "onDischargeForwardTo");
                    var bedNumber = _.get($rootScope.bedDetails, 'bedNumber') || _.get($rootScope.selectedBedInfo, 'bed.bedNumber');
                    messagingService.showMessage('info', $translate.instant("SUCCESSFULLY_DISCHARGED_MESSAGE", {bed: bedNumber}));
                }));
            };

            var showErrorMessage = function (bedDetails) {
                var patient = bedDetails.patients[0];
                var identifier = patient.display && patient.display.split(" - ")[0];
                patient.identifiers[0].identifier = identifier;
                messagingService.showMessage('error', $translate.instant("SELECT_AVAILABLE_BED_DEFAULT_MESSAGE", {identifier: identifier}));
                $scope.cancelConfirmationDialog();
            };

            $scope.admitConfirmation = function () {
                spinner.forPromise(bedService.getCompleteBedDetailsByBedId($rootScope.selectedBedInfo.bed.bedId).then(function (response) {
                    var bedDetails = response.data;
                    if (bedDetails.patients.length) {
                        showErrorMessage(bedDetails);
                        reloadStateWithContextParams();
                        return;
                    }
                    if (hideStartNewVisitPopUp && $scope.visitSummary && getVisitTypeUuid($scope.visitSummary.visitType) !== defaultVisitTypeUuid) {
                        $scope.closeCurrentVisitAndStartNewVisit();
                    } else {
                        createEncounterAndContinue();
                        $scope.cancelConfirmationDialog();
                    }
                }));
            };
        }
    ]);
