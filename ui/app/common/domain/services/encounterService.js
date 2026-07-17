"use strict";

angular.module("bahmni.common.domain").service("encounterService", [
    "$http",
    "$q",
    "$rootScope",
    "configurations",
    "$bahmniCookieStore",
    "messagingService",
    function ($http, $q, $rootScope, configurations, $bahmniCookieStore, messagingService) {
        this.buildEncounter = function (encounter) {
            encounter.observations = encounter.observations || [];
            encounter.observations.forEach(function (obs) {
                stripExtraConceptInfo(obs);
            });
            var bacterilogyMembers = getBacteriologyGroupMembers(encounter);
            bacterilogyMembers = bacterilogyMembers.reduce(function (mem1, mem2) {
                return mem1.concat(mem2);
            }, []);
            bacterilogyMembers.forEach(function (mem) {
                deleteIfImageOrVideoObsIsVoided(mem);
            });
            encounter.providers = encounter.providers || [];
            var providerData = $bahmniCookieStore.get(Bahmni.Common.Constants.grantProviderAccessDataCookieName);
            if (_.isEmpty(encounter.providers)) {
                if (providerData && providerData.uuid) {
                    encounter.providers.push({ uuid: providerData.uuid });
                } else if ($rootScope.currentProvider && $rootScope.currentProvider.uuid) {
                    encounter.providers.push({ uuid: $rootScope.currentProvider.uuid });
                }
            }
            return encounter;
        };

        var getBacteriologyGroupMembers = function (encounter) {
            var addBacteriologyMember = function (bacteriologyGroupMembers, member) {
                bacteriologyGroupMembers = member.groupMembers.length
          ? bacteriologyGroupMembers.concat(member.groupMembers)
          : bacteriologyGroupMembers.concat(member);
                return bacteriologyGroupMembers;
            };
            return encounter.extensions && encounter.extensions.mdrtbSpecimen
        ? encounter.extensions.mdrtbSpecimen.map(function (observation) {
            var bacteriologyGroupMembers = [];
            observation.sample.additionalAttributes &&
              observation.sample.additionalAttributes.groupMembers.forEach(function (member) {
                  bacteriologyGroupMembers = addBacteriologyMember(bacteriologyGroupMembers, member);
              });

            observation.report.results &&
              observation.report.results.groupMembers.forEach(function (member) {
                  bacteriologyGroupMembers = addBacteriologyMember(bacteriologyGroupMembers, member);
              });
            return bacteriologyGroupMembers;
        })
        : [];
        };

        var getDefaultEncounterType = function () {
            var url = Bahmni.Common.Constants.encounterTypeUrl;
            return $http.get(url + "/" + configurations.defaultEncounterType()).then(function (response) {
                return response.data;
            });
        };

        var getEncounterTypeBasedOnLoginLocation = function (loginLocationUuid) {
            return $http.get(Bahmni.Common.Constants.entityMappingUrl, {
                params: {
                    entityUuid: loginLocationUuid,
                    mappingType: "location_encountertype",
                    s: "byEntityAndMappingType"
                },
                withCredentials: true
            });
        };

        var getEncounterTypeBasedOnProgramUuid = function (programUuid) {
            return $http.get(Bahmni.Common.Constants.entityMappingUrl, {
                params: {
                    entityUuid: programUuid,
                    mappingType: "program_encountertype",
                    s: "byEntityAndMappingType"
                },
                withCredentials: true
            });
        };

        var getDefaultEncounterTypeIfMappingNotFound = function (entityMappings) {
            var encounterType = entityMappings.data.results[0] && entityMappings.data.results[0].mappings[0];
            if (!encounterType) {
                encounterType = getDefaultEncounterType();
            }
            return encounterType;
        };

        this.getEncounterType = function (programUuid, loginLocationUuid) {
            if (programUuid) {
                return getEncounterTypeBasedOnProgramUuid(programUuid).then(function (response) {
                    return getDefaultEncounterTypeIfMappingNotFound(response);
                });
            } else if (loginLocationUuid) {
                return getEncounterTypeBasedOnLoginLocation(loginLocationUuid).then(function (response) {
                    return getDefaultEncounterTypeIfMappingNotFound(response);
                });
            } else {
                return getDefaultEncounterType();
            }
        };

        var getDiagnosis = function (response, counsellingForm) {
            var ICD11Obs = [];
            var counsellingIDs = counsellingForm.map(function (form) {
                return form.formFieldPath;
            });

            if (response.observations) {
                ICD11Obs = response.observations.filter(function (item) {
                    return (
                  item.concept &&
                  item.concept.name.indexOf("ICD 11 Diagnosis") !== -1 &&
                  item.formFieldPath.indexOf("Counselling Form") === -1
                    );
                }).map(function (item) {
                    var getPaths = counsellingForm.find(function (form) {
                        return form.name === item.concept.name;
                    });
                    return Object.assign({}, item, {
                        formFieldPath: getPaths.formFieldPath
                    });
                });
            }

            var removedCounselling = [];

            if (response.observations) {
                removedCounselling = response.observations.filter(function (item) {
                    return counsellingIDs.indexOf(item.formFieldPath) === -1;
                });
            }
            if (ICD11Obs.length > 0) {
                var payload = Object.assign({}, response, {
                    encounterDateTime: Date.now(),
                    observations: removedCounselling.concat(ICD11Obs)
                });
                return payload;
            }
            return response;
        };

        // Form is registered as "Comprehensive Ophthalmic Examinations" (formerly "Optometrist
        // Assessment" — the form was renamed in Form Builder at some point, formFieldPath still
        // encodes whatever name is current). Keep this in sync if the form is ever renamed again.
        var OPTICAL_FORM_NAME = "comprehensive ophthalmic examinations";

        var OPTICAL_CONCEPT_UUIDS = {
            lensMaterial: "63e75edf-38d8-4b86-8d22-6080967d4732",
            lensForm: "3a6faca5-7037-4390-b583-69cc37175a3a",
            bifocalSpecification: "9e5e88ee-db3a-43a7-a40d-cc343e270ec1",
            surfaceTreatment: "2b100975-29bf-47d3-a08e-0b2aad2709d8",
            refractiveIndex: "644ef1f3-3a5f-4ef4-a64d-b0a40b2952be",
            frameRecommendation: "ab1b756a-43c9-4bf6-b529-969bff722f9a",
            other: "1b4392e0-b67e-4a65-870f-c2412362f295",
            orderPrescribed: "e62df613-8411-49f5-a0ee-12c444398f6d",
            additionalNotes: "0bab5ec5-f56a-4a3a-a7f1-87fe4d8a164f"
        };

        // Refraction Record's PG Distance/Near Rx fields — the same source the read-only
        // Prescription Slip table on the form mirrors (see formControls.js#attachPrescriptionSlipSync).
        var OPTICAL_RX_CONCEPT_UUIDS = {
            distance: {
                rightEye: { sph: "da39fa2d-c538-4dcf-b22a-8f7f4633af71", cyl: "edcc1bb5-3bf6-4ef8-9cc4-0808feb0bf6f",
                    axis: "cbda10c8-3973-439a-ac88-50f605e889b7", va: "f8309f2d-0bb4-480b-91b3-004d7ad86978" },
                leftEye: { sph: "a95b90c8-fd57-420f-90c4-769a7dea1268", cyl: "1bd492b8-e356-4d4d-ba5a-649fced3dfc2",
                    axis: "2f582b5c-fd88-4f03-8732-cc7bf79887e2", va: "9321ed89-5091-4410-ae88-6d54a42dd0e6" }
            },
            near: {
                rightEye: { sph: "1cec94c4-85e0-40e8-9932-003ecc6c6c43", cyl: "3fe03e9d-94df-46af-8b93-7f0e18b3dbd7",
                    axis: "cd1c59f0-3213-4c41-b7e9-36eaaa789adb", va: "49523f60-a257-4697-a8fc-fd606f17bb89" },
                leftEye: { sph: "cd2a330f-e24a-4676-8242-b8d79ef28a78", cyl: "1fbf868b-8714-47e0-bec9-30b2f704e720",
                    axis: "739de12b-ae97-4432-8b00-948cdbbfc0f7", va: "72b50337-833c-4def-8001-9dfc7b6d0bcd" }
            }
        };

        var ALL_OPTICAL_CONCEPT_UUIDS = (function () {
            var uuids = {};
            Object.keys(OPTICAL_CONCEPT_UUIDS).forEach(function (key) { uuids[OPTICAL_CONCEPT_UUIDS[key]] = true; });
            [OPTICAL_RX_CONCEPT_UUIDS.distance, OPTICAL_RX_CONCEPT_UUIDS.near].forEach(function (row) {
                [row.rightEye, row.leftEye].forEach(function (eye) {
                    Object.keys(eye).forEach(function (metric) { uuids[eye[metric]] = true; });
                });
            });
            return uuids;
        })();

        function findObsValues (observations, conceptUuid) {
            return (observations || [])
                .filter(function (obs) { return obs.concept && obs.concept.uuid === conceptUuid && obs.valueAsString; })
                .map(function (obs) { return obs.valueAsString; });
        }

        // Odoo's lens.material/form/surface_treatment/bifocal_specification enum values are the
        // concept answer's display text, lower_snake_cased (e.g. "Blue cut" -> "blue_cut") —
        // inferred from the /api/bdsec/optical sample payload and verified against the real
        // endpoint 2026-07-17 (see OpticalOdooService.java on the OpenMRS side).
        function toOdooEnum (displayText) {
            return displayText.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
        }

        function buildEyeRx (observations, eyeConceptUuids) {
            var sph = findObsValues(observations, eyeConceptUuids.sph)[0];
            var cyl = findObsValues(observations, eyeConceptUuids.cyl)[0];
            var axis = findObsValues(observations, eyeConceptUuids.axis)[0];
            var va = findObsValues(observations, eyeConceptUuids.va)[0];
            if (!sph && !cyl && !axis && !va) {
                return null;
            }
            var rx = {};
            if (sph) rx.sph = sph;
            if (cyl) rx.cyl = cyl;
            if (axis) rx.axis = axis;
            if (va) rx.va = va;
            return rx;
        }

        function buildEyeLens (observations, eyeRowConceptUuids) {
            var lens = {};
            var distance = buildEyeRx(observations, eyeRowConceptUuids.distance);
            var near = buildEyeRx(observations, eyeRowConceptUuids.near);
            if (distance) lens.distance = distance;
            if (near) lens.near = near;
            return lens;
        }

        // Builds the /api/bdsec/optical payload from a just-saved encounter's flat observation
        // list — returns null when the Prescription Slip section wasn't used on this encounter
        // (no Lens Material / Order Prescribed observation present), so unrelated ophthalmic
        // consultations never call Odoo.
        function buildOpticalPayload (encounterData) {
            var observations = encounterData.observations || [];
            var lensMaterial = findObsValues(observations, OPTICAL_CONCEPT_UUIDS.lensMaterial)[0];
            var orderPrescribed = findObsValues(observations, OPTICAL_CONCEPT_UUIDS.orderPrescribed)[0];
            if (!lensMaterial && !orderPrescribed) {
                return null;
            }

            var lens = {};
            if (lensMaterial) lens.material = toOdooEnum(lensMaterial);
            var lensForm = findObsValues(observations, OPTICAL_CONCEPT_UUIDS.lensForm)[0];
            if (lensForm) lens.form = toOdooEnum(lensForm);
            var surfaceTreatment = findObsValues(observations, OPTICAL_CONCEPT_UUIDS.surfaceTreatment).map(toOdooEnum);
            if (surfaceTreatment.length) lens.surface_treatment = surfaceTreatment;
            var bifocalSpecification = findObsValues(observations, OPTICAL_CONCEPT_UUIDS.bifocalSpecification).map(toOdooEnum);
            if (bifocalSpecification.length) lens.bifocal_specification = bifocalSpecification;
            var refractiveIndex = findObsValues(observations, OPTICAL_CONCEPT_UUIDS.refractiveIndex)[0];
            if (refractiveIndex) lens.refractive_index = refractiveIndex;

            lens.right_eye = buildEyeLens(observations, {
                distance: OPTICAL_RX_CONCEPT_UUIDS.distance.rightEye, near: OPTICAL_RX_CONCEPT_UUIDS.near.rightEye
            });
            lens.left_eye = buildEyeLens(observations, {
                distance: OPTICAL_RX_CONCEPT_UUIDS.distance.leftEye, near: OPTICAL_RX_CONCEPT_UUIDS.near.leftEye
            });

            var payload = {
                patient_id: encounterData.patientId,
                encounter_uuid: encounterData.encounterUuid,
                visit_uuid: encounterData.visitUuid,
                order_prescription: orderPrescribed === "Yes",
                lens: lens
            };
            var note = findObsValues(observations, OPTICAL_CONCEPT_UUIDS.additionalNotes)[0];
            if (note) payload.note = note;
            var frameRecommendation = findObsValues(observations, OPTICAL_CONCEPT_UUIDS.frameRecommendation)[0];
            if (frameRecommendation) payload.frame_recommendation = frameRecommendation;
            var other = findObsValues(observations, OPTICAL_CONCEPT_UUIDS.other)[0];
            if (other) payload.other = other;

            return payload;
        }

        this.sendToOdoo = function (encounterData) {
            var obs = encounterData.observations;
            if (obs && obs.length > 0) {
                var form = obs[0].formFieldPath && obs[0].formFieldPath.split(".")[0].toLowerCase();
                if (form === OPTICAL_FORM_NAME) {
                    encounterData.patientId = $rootScope.patientIdentifier;
                    var payload = buildOpticalPayload(encounterData);
                    if (!payload) {
                        return;
                    }
                    messagingService.showMessage("info", "Sending optical prescription to Odoo for billing...");
                    return $http.post(Bahmni.Common.Constants.odooConnectorUrl, payload, {
                        withCredentials: true
                    }).then(function (response) {
                        if (response.data && response.data.status === "success") {
                            messagingService.showMessage("info", "Optical prescription sent to Odoo successfully.");
                        } else {
                            messagingService.showMessage("error", "Odoo rejected the optical prescription: "
                                + (response.data && (response.data.message || response.data.error)));
                        }
                        return response;
                    }, function (error) {
                        messagingService.showMessage("error", "Could not send the optical prescription to Odoo.");
                        return $q.reject(error);
                    });
                }
            }
        };

        this.create = function (encounter) {
            encounter = this.buildEncounter(encounter);
            return getCounsellingForm().then(function (res) {
                var counsellingObs = getDiagnosis(encounter, res);
                return $http.post(Bahmni.Common.Constants.bahmniEncounterUrl, counsellingObs, {
                    withCredentials: true
                });
            })
        .then(
          function (response) {
              encounter.encounterUuid = response.data.encounterUuid;
              encounter.encounterDateTime = response.data.encounterDateTime;
              encounter.observations = getGlassObs(response.data);
              this.sendToOdoo(encounter);
              return response;
          }.bind(this)
        );
        };

        var parseForm = function (form) {
            var formName = form.name;
            var formVersion = form.version;
            var data = JSON.parse(form.resources[0].value);

            var control = null;
            for (var i = 0; i < data.controls.length; i++) {
                var group = data.controls[i];
                for (var j = 0; j < (group.controls || []).length; j++) {
                    if (group.controls[j].concept && group.controls[j].concept.name.indexOf("ICD 11 Diagnosis") !== -1) {
                        control = group;
                        break;
                    }
                }
                if (control) break;
            }

            if (control) {
                var controlIndex = -1;
                for (var k = 0; k < data.controls.length; k++) {
                    if (data.controls[k].id === control.id) {
                        controlIndex = k;
                        break;
                    }
                }

                var fields = [];
                for (var m = 0; m < control.controls.length; m++) {
                    var item = control.controls[m];
                    if (item.concept.name.indexOf("ICD 11 Diagnosis") !== -1) {
                        fields.push({
                            name: item.concept.name,
                            formFieldPath: formName + "." + formVersion + "/" + item.label.id + "-" + controlIndex
                        });
                    }
                }
                return fields;
            }

            return [];
        };

        function getCounsellingForm () {
            return $http.get(Bahmni.Common.Constants.latestPublishedForms, {
                params: {
                    formType: "v2"
                }
            }).then(function (response) {
                var counsellingForm = response.data.find(function (form) {
                    return form.name === "Counselling Form";
                });
                if (counsellingForm) {
                    return $http.get(Bahmni.Common.Constants.formUrl + "/" + counsellingForm.uuid, {
                        params: {
                            v: "custom:(id,uuid,name,version,published,auditInfo,resources:(value,dataType,uuid))"
                        }
                    }).then(function (res) {
                        return parseForm(res.data);
                    });
                }
                return [];
            });
        }

        // Filters an encounter's observations down to the ones sendToOdoo()/buildOpticalPayload()
        // care about — see OPTICAL_CONCEPT_UUIDS / OPTICAL_RX_CONCEPT_UUIDS above, which are the
        // single source of truth for which concepts feed the optical prescription.
        function getGlassObs (response) {
            var glassObs = [];

            if (response.observations) {
                response.observations.forEach((obs) => {
                    if (obs.concept && ALL_OPTICAL_CONCEPT_UUIDS[obs.concept.uuid]) {
                        glassObs.push(obs);
                    }
                });
            }

            return glassObs;
        }

        this.delete = function (encounterUuid, reason) {
            this.sendToOdoo({ encounterUuid: encounterUuid, reason: reason });
            return $http.delete(Bahmni.Common.Constants.bahmniEncounterUrl + "/" + encounterUuid, {
                params: { reason: reason }
            });
        };

        function isObsConceptClassVideoOrImage (obs) {
            return obs.concept.conceptClass === "Video" || obs.concept.conceptClass === "Image";
        }

        var deleteIfImageOrVideoObsIsVoided = function (obs) {
            if (obs.voided && obs.groupMembers && !obs.groupMembers.length && obs.value && isObsConceptClassVideoOrImage(obs)) {
                var url = Bahmni.Common.Constants.RESTWS_V1 + "/bahmnicore/visitDocument?filename=" + obs.value;
                $http.delete(url, { withCredentials: true });
            }
        };

        var stripExtraConceptInfo = function (obs) {
            deleteIfImageOrVideoObsIsVoided(obs);
            obs.concept = { uuid: obs.concept.uuid, name: obs.concept.name, dataType: obs.concept.dataType };
            obs.groupMembers = obs.groupMembers || [];
            obs.groupMembers.forEach(function (groupMember) {
                stripExtraConceptInfo(groupMember);
            });
        };

        var searchWithoutEncounterDate = function (visitUuid) {
            return $http.post(
        Bahmni.Common.Constants.bahmniEncounterUrl + "/find",
                {
                    visitUuids: [visitUuid],
                    includeAll: Bahmni.Common.Constants.includeAllObservations
                },
                {
                    withCredentials: true
                }
      );
        };

        this.search = function (visitUuid, encounterDate) {
            if (!encounterDate) {
                return searchWithoutEncounterDate(visitUuid);
            }

            return $http.get(Bahmni.Common.Constants.emrEncounterUrl, {
                params: {
                    visitUuid: visitUuid,
                    encounterDate: encounterDate,
                    includeAll: Bahmni.Common.Constants.includeAllObservations
                },
                withCredentials: true
            });
        };

        this.find = function (params) {
            return $http.post(Bahmni.Common.Constants.bahmniEncounterUrl + "/find", params, {
                withCredentials: true
            });
        };
        this.findByEncounterUuid = function (encounterUuid, params) {
            params = params || { includeAll: true };
            return $http.get(Bahmni.Common.Constants.bahmniEncounterUrl + "/" + encounterUuid, {
                params: params,
                withCredentials: true
            });
        };

        this.getEncountersForEncounterType = function (patientUuid, encounterTypeUuid) {
            return $http.get(Bahmni.Common.Constants.encounterUrl, {
                params: {
                    patient: patientUuid,
                    order: "desc",
                    encounterType: encounterTypeUuid,
                    v: "custom:(uuid,provider,visit:(uuid,startDatetime,stopDatetime),obs:(uuid,concept:(uuid,name),groupMembers:(id,uuid,obsDatetime,value,comment)))"
                },
                withCredentials: true
            });
        };

        this.getDigitized = function (patientUuid) {
            var patientDocumentEncounterTypeUuid = configurations.encounterConfig().getPatientDocumentEncounterTypeUuid();
            return $http.get(Bahmni.Common.Constants.encounterUrl, {
                params: {
                    patient: patientUuid,
                    encounterType: patientDocumentEncounterTypeUuid,
                    v: "custom:(uuid,obs:(uuid))"
                },
                withCredentials: true
            });
        };

        this.discharge = function (encounterData) {
            var encounter = this.buildEncounter(encounterData);
            return $http.post(Bahmni.Common.Constants.dischargeUrl, encounter, {
                withCredentials: true
            });
        };
    }
]);
