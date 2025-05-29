"use strict";

angular.module("bahmni.registration").controller("DuplicatePatientController", [
  "$scope",
  "$state",
  "ngDialog",
  "messagingService",
  "$translate",
  function ($scope, $state, ngDialog, messagingService, $translate) {
    $scope.duplicatePatients = $scope.ngDialogData.duplicatePatients || [];
    $scope.currentPatient = $scope.ngDialogData.currentPatient || {};

    $scope.getPatientAddress = function (patient) {
      if (!patient.addressFieldValue) {
        return "";
      }

      try {
        var address =
          typeof patient.addressFieldValue === "string" ? JSON.parse(patient.addressFieldValue) : patient.addressFieldValue;

        var addressParts = [];
        if (address.cityVillage) addressParts.push(address.cityVillage);
        if (address.countyDistrict) addressParts.push(address.countyDistrict);
        if (address.stateProvince) addressParts.push(address.stateProvince);

        return addressParts.join(", ");
      } catch (e) {
        return patient.addressFieldValue || "";
      }
    };

    $scope.selectExistingPatient = function (selectedPatient) {
      // Navigate to the selected patient's profile
      ngDialog.close();
      $state.go("patient.edit", { patientUuid: selectedPatient.uuid });
    };

    $scope.continueWithNewPatient = function () {
      // Close dialog and continue with current registration
      ngDialog.close("continue");
    };

    $scope.cancelRegistration = function () {
      // Close dialog and optionally clear form
      ngDialog.close("cancel");
    };
  },
]);
