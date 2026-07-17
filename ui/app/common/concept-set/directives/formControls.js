"use strict";

angular.module("bahmni.common.conceptSet").directive("formControls", [
    "formService",
    "spinner",
    "$timeout",
    "$translate",
    function (formService, spinner, $timeout, $translate) {
        var loadedFormDetails = {};
        var loadedFormTranslations = {};

        // PG refraction table (.pg-table): enabled only for exact published form names below.
        // Comprehensive Ophthalmic Examinations — "section" mode; section label must be "Refraction Record".
        // Cataract Surgery Refraction Record — "flat" mode; form must include a table header labeled "PD".
        // Visible obsControl labels must match buildCataractPGExactLabelMap / buildPGLabelLookupMap / getPGFieldTarget in this file.
        // Do not rename these forms or PG field labels in Form Builder without updating this JavaScript.
        var PG_TABLE_FORMS = {
            "Comprehensive Ophthalmic Examinations": "section",
            "Cataract Surgery Refraction Record": "flat"
        };

        function isRefractionRecordSectionLabel (text) {
            return text && text.trim().toLowerCase() === "refraction record";
        }

        var PG_TABLE_CELL_EYES = {
            DV: { RE: "Right Eye PG DV", LE: "Left Eye PG DV" },
            NV: { RE: "Right Eye PG NV", LE: "Left Eye PG NV" }
        };

        var PG_TABLE_FIELD_TYPES = {
            spherical: "Spherical",
            cylinder: "Cylinder",
            axis: "Axis",
            va: "V/A with PG"
        };

        var PG_TABLE_DEBUG = false;
        var PG_TABLE_EXPECTED_MOVE_COUNT = 16;
        var pgTableRebuildTimers = {};

        function buildPGLabelLookupMap () {
            var targets = [];
            var distanceLabels = [
                ["spherical", "RE"], ["spherical", "LE"], ["cylinder", "RE"], ["cylinder", "LE"], ["axis", "RE"], ["axis", "LE"],
                ["va", "RE"], ["va", "LE"]
            ];
            var nearLabels = [
                ["spherical", "RE"], ["spherical", "LE"], ["cylinder", "RE"], ["cylinder", "LE"], ["axis", "RE"], ["axis", "LE"],
                ["va", "RE"], ["va", "LE"]
            ];
            distanceLabels.forEach(function (entry) {
                targets.push({ field: entry[0], eyeSide: entry[1], powerType: "DV" });
            });
            nearLabels.forEach(function (entry) {
                targets.push({ field: entry[0], eyeSide: entry[1], powerType: "NV" });
            });

            var map = {};
            var fieldLabelNames = {
                spherical: "spherical",
                cylinder: "cylinder",
                axis: "axis",
                va: "v/a with pg"
            };
            var eyeLabelNames = { RE: "right eye", LE: "left eye" };
            var distanceSuffixes = [
                "pg distance rx",
                "pg dv distance rx",
                "pg dv",
                "pg distance"
            ];
            var nearSuffixes = [
                "pg near rx",
                "pg nv near rx",
                "pg nv",
                "pg near"
            ];

            targets.forEach(function (target) {
                var field = target.field;
                var eyeSide = target.eyeSide;
                var fieldName = fieldLabelNames[field];
                var eyeName = eyeLabelNames[eyeSide];
                var suffixes = target.powerType === "DV" ? distanceSuffixes : nearSuffixes;
                suffixes.forEach(function (suffix) {
                    if (field === "va") {
                        map[getPGLabelLookupKey("V/A with PG, " + eyeName + " " + suffix)] = target;
                        if (target.powerType === "NV") {
                            map[getPGLabelLookupKey("V/A with PG, " + eyeName + " PG Near Rx")] = target;
                            map[getPGLabelLookupKey("V/A with PG, " + eyeName + " PG NV Near Rx")] = target;
                        }
                    } else {
                        map[getPGLabelLookupKey(fieldName + ", " + eyeName + " " + suffix)] = target;
                        if (target.powerType === "NV") {
                            var titledField = fieldName.charAt(0).toUpperCase() + fieldName.slice(1);
                            var titledEye = eyeSide === "RE" ? "Right Eye" : "Left Eye";
                            map[getPGLabelLookupKey(titledField + ", " + titledEye + " PG Near Rx")] = target;
                            map[getPGLabelLookupKey(titledField + ", " + titledEye + " PG NV Near Rx")] = target;
                        }
                    }
                });
            });
            return map;
        }

        var PG_NORMALIZED_LABEL_MAP = buildPGLabelLookupMap();

        function registerPGLabelTarget (map, label, powerType, eyeSide, field) {
            map[getPGLabelLookupKey(label)] = {
                powerType: powerType,
                eyeSide: eyeSide,
                field: field
            };
        }

        function buildCataractPGExactLabelMap () {
            var map = {};
            var cataractLabels = [
                ["Spherical, Right Eye PG DV Distance Rx", "DV", "RE", "spherical"],
                ["Spherical, Left Eye PG DV Distance Rx", "DV", "LE", "spherical"],
                ["Cylinder, Right Eye PG DV Distance Rx", "DV", "RE", "cylinder"],
                ["Cylinder, Left Eye PG DV Distance Rx", "DV", "LE", "cylinder"],
                ["Axis, Right Eye PG DV Distance Rx", "DV", "RE", "axis"],
                ["Axis, Left Eye PG DV Distance Rx", "DV", "LE", "axis"],
                ["V/A with PG, Right Eye PG DV Distance Rx", "DV", "RE", "va"],
                ["V/A with PG, Left Eye PG DV Distance Rx", "DV", "LE", "va"],
                ["V/A with PG, Right Eye PG Distance Rx", "DV", "RE", "va"],
                ["V/A with PG, Left Eye PG Distance Rx", "DV", "LE", "va"],
                ["Spherical, Right Eye PG NV Near Rx", "NV", "RE", "spherical"],
                ["Spherical, Left Eye PG NV Near Rx", "NV", "LE", "spherical"],
                ["Cylinder, Right Eye PG NV Near Rx", "NV", "RE", "cylinder"],
                ["Cylinder, Left Eye PG NV Near Rx", "NV", "LE", "cylinder"],
                ["Axis, Right Eye PG NV Near Rx", "NV", "RE", "axis"],
                ["Axis, Left Eye PG NV Near Rx", "NV", "LE", "axis"],
                ["V/A with PG, Right Eye PG Near Rx", "NV", "RE", "va"],
                ["V/A with PG, Left Eye PG Near Rx", "NV", "LE", "va"],
                ["Spherical, Right Eye PG Distance Rx", "DV", "RE", "spherical"],
                ["Spherical, Left Eye PG Distance Rx", "DV", "LE", "spherical"],
                ["Cylinder, Right Eye PG Distance Rx", "DV", "RE", "cylinder"],
                ["Cylinder, Left Eye PG Distance Rx", "DV", "LE", "cylinder"],
                ["Axis, Right Eye PG Distance Rx", "DV", "RE", "axis"],
                ["Axis, Left Eye PG Distance Rx", "DV", "LE", "axis"],
                ["Spherical, Right Eye PG Near Rx", "NV", "RE", "spherical"],
                ["Spherical, Left Eye PG Near Rx", "NV", "LE", "spherical"],
                ["Cylinder, Right Eye PG Near Rx", "NV", "RE", "cylinder"],
                ["Cylinder, Left Eye PG Near Rx", "NV", "LE", "cylinder"],
                ["Axis, Right Eye PG Near Rx", "NV", "RE", "axis"],
                ["Axis, Left Eye PG Near Rx", "NV", "LE", "axis"],
                ["V/A with PG, Right Eye PG NV Near Rx", "NV", "RE", "va"],
                ["V/A with PG, Left Eye PG NV Near Rx", "NV", "LE", "va"]
            ];
            cataractLabels.forEach(function (entry) {
                registerPGLabelTarget(map, entry[0], entry[1], entry[2], entry[3]);
            });
            return map;
        }

        var CATARACT_PG_EXACT_LABEL_MAP = buildCataractPGExactLabelMap();

        function normalizePGLabelText (labelText) {
            if (!labelText) {
                return "";
            }
            return labelText.trim()
                .replace(/\s*\([^)]*\)\s*$/g, "")
                .replace(/\s*\*+\s*/g, " ")
                .replace(/\s+/g, " ")
                .trim();
        }

        function getPGLabelLookupKey (labelText) {
            return normalizePGLabelText(labelText).toLowerCase().replace(/,/g, "").replace(/\s+/g, " ").trim();
        }

        function getPGFieldTarget (labelText) {
            var lookupKey = getPGLabelLookupKey(labelText);
            if (CATARACT_PG_EXACT_LABEL_MAP[lookupKey]) {
                return CATARACT_PG_EXACT_LABEL_MAP[lookupKey];
            }
            if (PG_NORMALIZED_LABEL_MAP[lookupKey]) {
                return PG_NORMALIZED_LABEL_MAP[lookupKey];
            }

            var text = lookupKey;
            if (!text) {
                return null;
            }

            var field = null;
            if (text.indexOf("v/a with pg") !== -1 || text.indexOf("v/a") === 0) {
                field = "va";
            } else if (text.indexOf("spherical") !== -1) {
                field = "spherical";
            } else if (text.indexOf("cylinder") !== -1) {
                field = "cylinder";
            } else if (text.indexOf("axis") !== -1) {
                field = "axis";
            } else {
                return null;
            }

            var eyeSide = null;
            if (text.indexOf("right eye") !== -1) {
                eyeSide = "RE";
            } else if (text.indexOf("left eye") !== -1) {
                eyeSide = "LE";
            } else {
                return null;
            }

            var powerType = null;
            if (/\bpg\s*nv\s*near\s*rx\b/.test(text) || /\bpg\s*near\s*rx\b/.test(text) ||
                /\bpg\s*nv\b/.test(text) || /\bpg\s*near\b/.test(text)) {
                powerType = "NV";
            } else if (/\bpg\s*dv\s*distance\s*rx\b/.test(text) || /\bpg\s*distance\s*rx\b/.test(text) ||
                /\bpg\s*dv\b/.test(text) || /\bpg\s*distance\b/.test(text) ||
                (/\bdistance\s*rx\b/.test(text) && !/\bnear\s*rx\b/.test(text))) {
                powerType = "DV";
            }
            if (!powerType) {
                return null;
            }

            return { powerType: powerType, eyeSide: eyeSide, field: field };
        }

        function getPGCellAttributes (target) {
            if (!target) {
                return null;
            }
            var eye = PG_TABLE_CELL_EYES[target.powerType][target.eyeSide];
            var type = PG_TABLE_FIELD_TYPES[target.field];
            if (!eye || !type) {
                return null;
            }
            return { eye: eye, type: type };
        }

        function parsePGObsLabel (labelText) {
            return getPGCellAttributes(getPGFieldTarget(labelText));
        }

        function getPGTargetKey (target) {
            return target.powerType + "|" + target.eyeSide + "|" + target.field;
        }

        function logPGFieldRowDiagnostic (rowIndex, details) {
            if (PG_TABLE_DEBUG) {
                console.log("[PG row diagnostic]", Object.assign({ rowIndex: rowIndex }, details));
            }
        }

        function logPGMoveOperationDiagnostic (operation, inputContainer) {
            if (PG_TABLE_DEBUG) {
                console.log("[PG move operation]", {
                    labelText: operation.labelText,
                    inferred: operation.inferred,
                    targetKey: operation.targetKey,
                    eye: operation.parsed.eye,
                    type: operation.parsed.type,
                    hasInputContainer: !!inputContainer,
                    inputAlreadyInTable: inputContainer ? !!inputContainer.closest(".pg-table") : false
                });
            }
        }

        function logPGTableCellDiagnostics (table) {
            if (!PG_TABLE_DEBUG || !table) {
                return;
            }
            var cells = table.querySelectorAll(".input-cell");
            var report = [];
            for (var i = 0; i < cells.length; i++) {
                var cell = cells[i];
                var child = cell.firstElementChild;
                report.push({
                    dataEye: cell.getAttribute("data-eye"),
                    dataType: cell.getAttribute("data-type"),
                    dataPgTargetKey: cell.getAttribute("data-pg-target-key"),
                    childrenCount: cell.children.length,
                    childTag: child ? child.tagName : null,
                    childType: child ? child.getAttribute("type") : null,
                    childClass: child ? child.className : null
                });
            }
            console.log("[PG table cells]", report);
        }

        function buildPGMoveCandidate (wrapper, fieldTarget, labelText, inferred) {
            var targetKey = getPGTargetKey(fieldTarget);
            return {
                wrapper: wrapper,
                fieldTarget: fieldTarget,
                labelText: labelText,
                labelKey: inferred ? targetKey : getPGLabelLookupKey(labelText),
                targetKey: targetKey,
                inferred: inferred
            };
        }

        function findPGTableCell (table, eye, type) {
            var cells = table.getElementsByClassName("input-cell");
            for (var i = 0; i < cells.length; i++) {
                if (cells[i].getAttribute("data-eye") === eye && cells[i].getAttribute("data-type") === type) {
                    return cells[i];
                }
            }
            return null;
        }

        function logPGTableMapping (labelText, target, matched, detail) {
            if (PG_TABLE_DEBUG) {
                console.log("[PG table mapping]", {
                    labelText: labelText,
                    target: target,
                    matched: matched,
                    detail: detail
                });
            }
        }

        function findPGTableContainers (formName, formUuid) {
            var mode = PG_TABLE_FORMS[formName];
            if (!mode) {
                return [];
            }

            if (mode === "section") {
                var sectionFormRoot = document.getElementById(formUuid);
                if (!sectionFormRoot) {
                    return [];
                }
                var refractionSectionLabels = sectionFormRoot.getElementsByClassName("test-section-label");
                for (var i = 0; i < refractionSectionLabels.length; i++) {
                    if (isRefractionRecordSectionLabel(refractionSectionLabels[i].textContent)) {
                        return [sectionFormRoot];
                    }
                }
                return [];
            }

            if (mode === "flat") {
                var formRoot = document.getElementById(formUuid);
                if (!formRoot) {
                    return [];
                }
                var pdHeaders = formRoot.querySelectorAll(".table-header.test-table-label");
                for (var k = 0; k < pdHeaders.length; k++) {
                    if (pdHeaders[k].textContent.trim().toUpperCase() === "PD") {
                        return [formRoot];
                    }
                }
            }
            return [];
        }

        function findFirstPGFieldRow (container) {
            var rows = container.getElementsByClassName("form-builder-row");
            for (var i = 0; i < rows.length; i++) {
                var label = rows[i].querySelector("label");
                if (label && parsePGObsLabel(label.textContent)) {
                    return rows[i];
                }
            }
            return null;
        }

        function findPGWrapperForRelease (container, targetKey, labelKey) {
            var rows = container.getElementsByClassName("form-builder-row");
            if (targetKey) {
                for (var r = 0; r < rows.length; r++) {
                    if (rows[r].getAttribute("data-pg-target-key") === targetKey) {
                        return rows[r];
                    }
                }
            }
            if (labelKey) {
                for (var s = 0; s < rows.length; s++) {
                    var label = rows[s].querySelector("label");
                    if (label && getPGLabelLookupKey(label.textContent) === labelKey) {
                        return rows[s];
                    }
                }
            }
            return null;
        }

        function releasePGInputsBeforeTableRemoval (tableWrapper, container) {
            if (!tableWrapper || !container) {
                return;
            }
            var cells = tableWrapper.querySelectorAll(".pg-table .input-cell");
            for (var c = 0; c < cells.length; c++) {
                var cell = cells[c];
                var targetKey = cell.getAttribute("data-pg-target-key");
                var labelKey = cell.getAttribute("data-pg-label-key");
                var inputContainer = getObsControlInputContainer(cell);
                if (!inputContainer || (!targetKey && !labelKey)) {
                    continue;
                }
                var wrapper = findPGWrapperForRelease(container, targetKey, labelKey);
                if (wrapper) {
                    wrapper.style.display = "";
                    wrapper.classList.remove("pg-field-moved");
                    wrapper.removeAttribute("data-pg-target-key");
                    var restoreTarget = getObsControlRestoreContainer(wrapper);
                    restoreTarget.appendChild(inputContainer);
                }
                cell.removeAttribute("data-pg-target-key");
                cell.removeAttribute("data-pg-label-key");
            }
        }

        function disconnectPGMoveObserver (container) {
            if (!container) {
                return;
            }
            if (container._pgMoveObserver) {
                container._pgMoveObserver.disconnect();
                container._pgMoveObserver = null;
            }
            if (container._pgMoveObserverStopTimeout) {
                $timeout.cancel(container._pgMoveObserverStopTimeout);
                container._pgMoveObserverStopTimeout = null;
            }
        }

        function schedulePGTableMovePasses (pgContainer) {
            if (!pgContainer) {
                return;
            }

            disconnectPGMoveObserver(pgContainer);

            function runMovePasses () {
                var table = pgContainer.querySelector(".pg-table-wrapper .pg-table");
                if (!table) {
                    return null;
                }
                return moveInputsToCells(pgContainer, table);
            }

            runMovePasses();

            if (typeof MutationObserver !== "undefined") {
                var observer = new MutationObserver(function () {
                    runMovePasses();
                });
                observer.observe(pgContainer, { childList: true, subtree: true });
                pgContainer._pgMoveObserver = observer;
                pgContainer._pgMoveObserverStopTimeout = $timeout(function () {
                    disconnectPGMoveObserver(pgContainer);
                }, 4000, false);
            }

            [150, 400, 800].forEach(function (delayMs) {
                $timeout(function () {
                    runMovePasses();
                }, delayMs, false);
            });
        }

        function removeExistingPGTableWrappers (container) {
            if (!container) {
                return;
            }
            disconnectPGMoveObserver(container);
            var wrappers = container.querySelectorAll(".pg-table-wrapper");
            for (var i = wrappers.length - 1; i >= 0; i--) {
                releasePGInputsBeforeTableRemoval(wrappers[i], container);
                if (wrappers[i].parentNode) {
                    wrappers[i].parentNode.removeChild(wrappers[i]);
                }
            }
        }

        function insertPGTableWrapper (container, tableWrapper) {
            if (!container || !tableWrapper) {
                return;
            }

            var anchorRow = findFirstPGFieldRow(container);
            if (anchorRow && anchorRow.parentNode) {
                var insertParent = anchorRow.parentNode;
                if (!insertParent.contains(tableWrapper)) {
                    insertParent.insertBefore(tableWrapper, anchorRow);
                }
                return;
            }

            if (!container.contains(tableWrapper)) {
                container.appendChild(tableWrapper);
            }
        }

        function createPrescriptionTable () {
            var columns = document.querySelectorAll(".form-builder-column");
            var prescriptionSection = "";

      // Find prescription section
            for (var i = 0; i < columns.length; i++) {
                var strongElements = columns[i].getElementsByClassName("test-section-label");
                for (var j = 0; j < strongElements.length; j++) {
                    if (strongElements[j].textContent.trim().indexOf("Eye Glass Treatment") !== -1) {
                        prescriptionSection = columns[i].getElementsByClassName("obsGroup-controls")[0];
                    }
                }
            }

            if (prescriptionSection) {
        // runPostRenderCustomisations() re-runs on every form.component re-render (form
        // validation passes, Save included, not just the initial load) — remove any wrapper
        // left over from a previous pass first, or they'd stack up one on top of another.
                var existingWrappers = prescriptionSection.getElementsByClassName("prescription-table-wrapper");
                while (existingWrappers.length) {
                    existingWrappers[0].parentNode.removeChild(existingWrappers[0]);
                }

        // Create table elements
                var table = document.createElement("table");
                table.className = "prescription-table";
                var headerRow = document.createElement("tr");

        // Create header cells
                var headers = ["#", "Right Eye", "Left Eye"];
                headers.forEach(function (headerText) {
                    var th = document.createElement("th");
                    th.textContent = headerText;
                    if (headerText !== "#") {
                        th.colSpan = "4";
                    }
                    headerRow.appendChild(th);
                });

        // Create subheader row
                var subHeaderRow = document.createElement("tr");
                var rxCell = document.createElement("th");
                rxCell.textContent = "RX";
                subHeaderRow.appendChild(rxCell);

        // Add subheaders for both eyes
                ["Right Eye", "Left Eye"].forEach(function () {
                    ["SPH", "CYL", "Axis", "V/A"].forEach(function (text) {
                        var th = document.createElement("th");
                        th.textContent = text;
                        subHeaderRow.appendChild(th);
                    });
                });

        // Create rows with mapped cells for inputs
                var rowLabels = ["Distance", "Near"];
                var rows = rowLabels.map(function (label) {
                    var tr = document.createElement("tr");
                    var labelCell = document.createElement("td");
                    labelCell.textContent = label;
                    labelCell.className = "row-label";
                    tr.appendChild(labelCell);

          // Add cells for both eyes
                    ["Right Eye", "Left Eye"].forEach(function (eye) {
                        ["SPH", "CYL", "Axis", "V/A"].forEach(function (type) {
                            var td = document.createElement("td");
                            td.className = "input-cell";
                            td.setAttribute("data-eye", eye);
                            td.setAttribute("data-type", type);
                            td.setAttribute("data-row", label);
                            tr.appendChild(td);
                        });
                    });

                    return tr;
                });

        // Assemble table
                table.appendChild(headerRow);
                table.appendChild(subHeaderRow);
                rows.forEach(function (row) {
                    table.appendChild(row);
                });

        // Explanatory note — these cells are a read-only reflection of the Refraction
        // Record's PG Distance/Near Rx fields above, not separately editable here.
                var note = document.createElement("div");
                note.className = "prescription-table-note";
                note.textContent = "SPH/CYL/Axis/V-A values reflect the Refraction Record above and update automatically.";

        // Create wrapper
                var tableWrapper = document.createElement("div");
                tableWrapper.className = "prescription-table-wrapper";
                tableWrapper.appendChild(note);
                tableWrapper.appendChild(table);

        // Insert table
                prescriptionSection.prepend(tableWrapper);

        // Values are populated/kept in sync by attachPrescriptionSlipSync(), which runs
        // off the Refraction Record's pg-table (see moveInputsToCells) once it exists —
        // this section has no SPH/CYL/Axis/V-A fields of its own to move.
            }
        }

    // ---------- Read-only sync: Prescription Slip table <- Refraction Record pg-table ----------
    // The Prescription Slip's SPH/CYL/Axis/V-A grid has no obs fields of its own; by design
    // (see task discussion) it mirrors the values already captured in the Refraction Record's
    // PG Distance/Near Rx fields just above it, read-only, so there is only one place to edit
    // a prescription and no duplicate data entry.

        var RX_SLIP_FIELD_TO_PG_TYPE = { SPH: "Spherical", CYL: "Cylinder", Axis: "Axis", "V/A": "V/A with PG" };
        var RX_SLIP_ROW_TO_POWER_TYPE = { Distance: "DV", Near: "NV" };

    // Reads the currently displayed value out of a pg-table input cell — the selected
    // option's label for the react-select-backed fields (Spherical/Cylinder/V-A), or the
    // raw text for the plain-text Axis field.
        function getPGCellDisplayValue (cell) {
            if (!cell) {
                return "";
            }
            var valueLabel = cell.querySelector(".Select-value-label");
            if (valueLabel) {
                return valueLabel.textContent.trim();
            }
            var textField = cell.querySelector("textarea, input[type='text'], input:not([type])");
            if (textField) {
                return (textField.value || "").trim();
            }
            return "";
        }

        function syncPrescriptionSlipTable (formRoot, pgTable) {
            var slipTable = formRoot && formRoot.querySelector(".prescription-table");
            if (!slipTable || !pgTable) {
                return;
            }
            var slipCells = slipTable.querySelectorAll("td.input-cell");
            Array.prototype.forEach.call(slipCells, function (slipCell) {
                var eye = slipCell.getAttribute("data-eye");
                var type = slipCell.getAttribute("data-type");
                var row = slipCell.getAttribute("data-row");
                var pgType = RX_SLIP_FIELD_TO_PG_TYPE[type];
                var powerType = RX_SLIP_ROW_TO_POWER_TYPE[row];
                if (!pgType || !powerType || !eye) {
                    return;
                }
                var pgEye = eye + " PG " + powerType;
                var pgCell = pgTable.querySelector(
                    'td.input-cell[data-eye="' + pgEye + '"][data-type="' + pgType + '"]'
                );
                var value = getPGCellDisplayValue(pgCell);
                if (slipCell.textContent !== value) {
                    slipCell.textContent = value;
                }
            });
        }

    // Attached once per pg-table build: reacts to react-select option insertion (DOM
    // mutation) and to typing in the Axis textarea (native 'input' event, which does not
    // mutate the DOM tree and so would not be seen by the MutationObserver alone) so the
    // read-only slip table stays live as the optometrist fills in the Refraction Record.
        function attachPrescriptionSlipSync (formRoot, pgTable) {
            if (!pgTable) {
                return;
            }
            if (pgTable._slipSyncAttached) {
                syncPrescriptionSlipTable(formRoot, pgTable);
                return;
            }
            pgTable._slipSyncAttached = true;
            pgTable.addEventListener("input", function () {
                syncPrescriptionSlipTable(formRoot, pgTable);
            });
            var observer = new MutationObserver(function () {
                syncPrescriptionSlipTable(formRoot, pgTable);
            });
            observer.observe(pgTable, { childList: true, subtree: true, characterData: true });
            syncPrescriptionSlipTable(formRoot, pgTable);
        }

        function createFreshPGTable () {
            var table = document.createElement("table");
            table.className = "pg-table";

            var headerRow = document.createElement("tr");
            var headers = ["PG Power:", "Spherical", "Cylinder", "Axis", "V/A with PG"];
            headers.forEach(function (headerText, index) {
                var th = document.createElement("th");
                th.textContent = headerText;
                if (index === 0) {
                    th.className = "header-cell";
                    th.colSpan = 2;
                }
                headerRow.appendChild(th);
            });

            table.appendChild(headerRow);
            table.appendChild(createRow("DV", "RE:", "Right Eye PG DV"));
            table.appendChild(createSubRow("LE:", "Left Eye PG DV"));
            table.appendChild(createRow("NV", "RE:Add", "Right Eye PG NV"));
            table.appendChild(createSubRow("LE:Add", "Left Eye PG NV"));

            return table;
        }

        function buildPGTableInContainer (pgContainer) {
            if (!pgContainer) {
                return { pgRowsFound: 0, movedCount: 0 };
            }

            removeExistingPGTableWrappers(pgContainer);

            var table = createFreshPGTable();
            var tableWrapper = document.createElement("div");
            tableWrapper.className = "pg-table-wrapper";
            tableWrapper.appendChild(table);

            insertPGTableWrapper(pgContainer, tableWrapper);

            var moveResult = moveInputsToCells(pgContainer, table);
            schedulePGTableMovePasses(pgContainer);

            return moveResult;
        }

        function scheduleCreatePGTable (formName, formUuid) {
            if (pgTableRebuildTimers[formUuid]) {
                $timeout.cancel(pgTableRebuildTimers[formUuid]);
            }
            pgTableRebuildTimers[formUuid] = $timeout(function () {
                pgTableRebuildTimers[formUuid] = null;
                createPGTable(formName, formUuid);
            }, 50, false);
        }

        function createPGTable (formName, formUuid) {
            var containers = findPGTableContainers(formName, formUuid);
            containers.forEach(function (pgContainer) {
                var moveResult = buildPGTableInContainer(pgContainer);
                if (PG_TABLE_DEBUG) {
                    console.log("[PG rebuild]", {
                        formName: formName,
                        formUuid: formUuid,
                        container: pgContainer,
                        pgRowsFound: moveResult.pgRowsFound,
                        movedCount: moveResult.movedCount
                    });
                }
            });
        }

        function createRow (mainLabel, subLabel, eyeIdentifier) {
            var tr = document.createElement("tr");

      // Create main label cell
            var mainLabelCell = document.createElement("td");
            mainLabelCell.textContent = mainLabel;
            mainLabelCell.rowSpan = 2;
            mainLabelCell.className = "main-label";
            tr.appendChild(mainLabelCell);

      // Create sub label cell
            var subLabelCell = document.createElement("td");
            subLabelCell.textContent = subLabel;
            subLabelCell.className = "sub-label";
            tr.appendChild(subLabelCell);

      // Create data cells
            ["Spherical", "Cylinder", "Axis", "V/A with PG"].forEach(function (type) {
                var td = document.createElement("td");
                td.className = "input-cell";
                td.setAttribute("data-eye", eyeIdentifier);
                td.setAttribute("data-type", type);
                tr.appendChild(td);
            });

            return tr;
        }

        function createSubRow (subLabel, eyeIdentifier) {
            var tr = document.createElement("tr");

      // Create sub label cell
            var subLabelCell = document.createElement("td");
            subLabelCell.textContent = subLabel;
            subLabelCell.className = "sub-label";
            tr.appendChild(subLabelCell);

      // Create data cells
            ["Spherical", "Cylinder", "Axis", "V/A with PG"].forEach(function (type) {
                var td = document.createElement("td");
                td.className = "input-cell";
                td.setAttribute("data-eye", eyeIdentifier);
                td.setAttribute("data-type", type);
                tr.appendChild(td);
            });

            return tr;
        }

        function getObsControlInputContainer (wrapper, fieldTarget) {
            var contentWrap = wrapper.querySelector(".form-field-content-wrap");
            var searchRoot = contentWrap || wrapper;
            var inputContainer = null;

            if (fieldTarget && fieldTarget.field === "axis") {
                inputContainer = searchRoot.querySelector(".obs-control-field") ||
                    searchRoot.querySelector("textarea, input[type='text'], input:not([type])");
            } else if (fieldTarget && (fieldTarget.field === "spherical" ||
                fieldTarget.field === "cylinder" || fieldTarget.field === "va")) {
                inputContainer = searchRoot.querySelector(".obs-control-select-wrapper");
            }

            if (!inputContainer) {
                inputContainer = searchRoot.querySelector(".obs-control-select-wrapper") ||
                    searchRoot.querySelector(".obs-control-field") ||
                    searchRoot.querySelector("input, select, textarea");
            }
            if (inputContainer) {
                return inputContainer;
            }
            if (contentWrap) {
                for (var i = 0; i < contentWrap.children.length; i++) {
                    var child = contentWrap.children[i];
                    if (child.querySelector("input, select, textarea, .Select") ||
                        child.textContent.trim() ||
                        child.children.length) {
                        return child;
                    }
                }

                if (contentWrap.textContent.trim() || contentWrap.children.length) {
                    return contentWrap;
                }
            }

            for (var j = 0; j < wrapper.children.length; j++) {
                var wrapperChild = wrapper.children[j];
                var tagName = wrapperChild.tagName ? wrapperChild.tagName.toLowerCase() : "";

                if (tagName === "label") {
                    continue;
                }

                if (wrapperChild.classList && wrapperChild.classList.contains("pg-table-wrapper")) {
                    continue;
                }

                if (wrapperChild.querySelector &&
                    (wrapperChild.querySelector("input, select, textarea, .Select") ||
                    wrapperChild.textContent.trim() ||
                    wrapperChild.children.length)) {
                    return wrapperChild;
                }
            }

            return null;
        }

        function getObsControlRestoreContainer (wrapper) {
            return wrapper.querySelector(".form-field-content-wrap") || wrapper;
        }

        function getPGFieldRows (container) {
            var rows = container.getElementsByClassName("form-builder-row");
            var candidates = [];

            for (var i = 0; i < rows.length; i++) {
                var wrapper = rows[i];

                if (wrapper.classList.contains("pg-field-moved") || wrapper.style.display === "none") {
                    continue;
                }

                var label = wrapper.querySelector("label");
                if (!label) {
                    continue;
                }

                var labelText = label.textContent.trim();
                var fieldTarget = getPGFieldTarget(labelText);
                if (!fieldTarget) {
                    continue;
                }

                var inputContainer = getObsControlInputContainer(wrapper, fieldTarget) ||
                    getObsControlInputContainer(wrapper);

                if (!inputContainer) {
                    logPGFieldRowDiagnostic(i, {
                        labelText: labelText,
                        targetKey: getPGTargetKey(fieldTarget),
                        detail: "input-missing"
                    });
                    continue;
                }

                candidates.push(buildPGMoveCandidate(
                    wrapper,
                    fieldTarget,
                    labelText,
                    false
                ));
            }

            if (PG_TABLE_DEBUG) {
                console.log("[PG row candidates]", {
                    candidateCount: candidates.length,
                    expected: PG_TABLE_EXPECTED_MOVE_COUNT
                });
            }

            return candidates;
        }

        function clearPGTableCell (cell) {
            while (cell.firstChild) {
                cell.removeChild(cell.firstChild);
            }
        }

        function moveInputsToCells (section, table) {
            var candidates = getPGFieldRows(section);
            var moveOperations = [];
            var pgRowsFound = 0;

            candidates.forEach(function (candidate) {
                var wrapper = candidate.wrapper;
                if (wrapper.classList.contains("pg-field-moved") || wrapper.style.display === "none") {
                    return;
                }

                var fieldTarget = candidate.fieldTarget;
                var parsed = getPGCellAttributes(fieldTarget);
                if (!parsed) {
                    return;
                }

                pgRowsFound += 1;

                var cell = findPGTableCell(table, parsed.eye, parsed.type);
                var inputContainer = getObsControlInputContainer(wrapper, fieldTarget);

                if (!cell) {
                    logPGTableMapping(candidate.labelText, fieldTarget, false, "cell-missing");
                    return;
                }
                if (!inputContainer) {
                    logPGTableMapping(candidate.labelText, fieldTarget, false, "input-missing");
                    return;
                }
                if (inputContainer.closest(".pg-table")) {
                    logPGTableMapping(candidate.labelText, fieldTarget, false, "input-already-in-table");
                    return;
                }

                var operation = {
                    wrapper: wrapper,
                    inputContainer: inputContainer,
                    cell: cell,
                    labelText: candidate.labelText,
                    fieldTarget: fieldTarget,
                    parsed: parsed,
                    labelKey: candidate.labelKey,
                    targetKey: candidate.targetKey,
                    inferred: candidate.inferred
                };
                logPGMoveOperationDiagnostic(operation, inputContainer);
                moveOperations.push(operation);
            });

            var movedCount = 0;

            moveOperations.forEach(function (operation) {
                clearPGTableCell(operation.cell);
                operation.cell.removeAttribute("data-pg-target-key");
                operation.cell.removeAttribute("data-pg-label-key");
                operation.cell.appendChild(operation.inputContainer);

                if (operation.cell.children.length === 0) {
                    logPGTableMapping(
                        operation.labelText,
                        operation.fieldTarget,
                        false,
                        "append-failed"
                    );
                    if (PG_TABLE_DEBUG) {
                        console.log("[PG move append failed]", {
                            targetKey: operation.targetKey,
                            labelText: operation.labelText
                        });
                    }
                    return;
                }

                operation.cell.setAttribute("data-pg-target-key", operation.targetKey);
                operation.cell.setAttribute("data-pg-label-key", operation.labelKey);
                operation.wrapper.setAttribute("data-pg-target-key", operation.targetKey);
                operation.wrapper.style.display = "none";
                operation.wrapper.classList.add("pg-field-moved");
                movedCount += 1;

                if (PG_TABLE_DEBUG) {
                    console.log("[PG move appended]", {
                        targetKey: operation.targetKey,
                        cellChildren: operation.cell.children.length,
                        inferred: operation.inferred
                    });
                }

                logPGTableMapping(
                    operation.labelText,
                    operation.fieldTarget,
                    true,
                    operation.parsed.eye + " / " + operation.parsed.type +
                        (operation.inferred ? " (inferred)" : "")
                );
            });

            if (PG_TABLE_DEBUG) {
                console.log("[PG move complete]", {
                    pgRowsFound: pgRowsFound,
                    queued: moveOperations.length,
                    movedCount: movedCount,
                    expected: PG_TABLE_EXPECTED_MOVE_COUNT
                });
                logPGTableCellDiagnostics(table);
            }

            attachPrescriptionSlipSync(section, table);

            return { pgRowsFound: pgRowsFound, movedCount: movedCount };
        }

        function createEyeDiagram (eyeSide, inputs) {
            var diagram = document.createElement("div");
            diagram.className = "eye-diagram " + eyeSide + "-eye";

            var centerX = 150,
                centerY = 150,
                radius = 100;
            var adjustmentRatio = 1.033;
            var verticalShift = -20;

            var positions = [
        { angle: 0, label: "Right" },
        { angle: 60, label: "Bottom Right" },
        { angle: 120, label: "Bottom Left" },
        { angle: 180, label: "Left" },
        { angle: 240, label: "Top Left" },
        { angle: 300, label: "Top Right" }
            ];

            positions.forEach(function (pos) {
                var line = document.createElement("div");
                line.className = "diagram-line";
                line.style.width = radius + "px";
                line.style.transform = "rotate(" + pos.angle + "deg)";
                line.style.left = centerX + "px";
                line.style.top = centerY + "px";
                diagram.appendChild(line);

                var field = inputs.find((input) => {
                    var label = input.querySelector("label");
                    var shortenedLabel = label.textContent.split(",").pop().trim();
                    label.textContent = shortenedLabel;
                    return shortenedLabel === pos.label;
                });
                field.className = "diagram-field";
                var angleRad = pos.angle * (Math.PI / 180);

                var fieldX = centerX + (radius + 20) * Math.cos(angleRad) * adjustmentRatio;
                var fieldY = centerY + (radius + 20) * Math.sin(angleRad) * adjustmentRatio + verticalShift;

                field.style.left = fieldX + "px";
                field.style.top = fieldY + "px";
                field.setAttribute("data-position", eyeSide + " Eye, " + pos.label);
                diagram.appendChild(field);
            });

            return diagram;
        }

        function renderMotilityTest (parent, rightEyeInputs, leftEyeInputs) {
            var container = document.createElement("div");
            container.className = "motility-test-container";

            var leftEyeDiagram = createEyeDiagram("Left", leftEyeInputs);
            var rightEyeDiagram = createEyeDiagram("Right", rightEyeInputs);

            container.appendChild(leftEyeDiagram);
            container.appendChild(rightEyeDiagram);

            parent.appendChild(container);
            return parent;
        }

        function createGonioscopyDiagram (eyeSide, inputs) {
            var diagram = document.createElement("div");
            diagram.className = "gonioscopy-diagram " + eyeSide + "-eye";

            var centerX = 150,
                centerY = 150,
                radius = 100;

            var positions = [
        { angle: 0, label: "Right", x: 250, y: 120 },
        { angle: 90, label: "Bottom", x: 160, y: 220 },
        { angle: 180, label: "Left", x: 50, y: 120 },
        { angle: 270, label: "Top", x: 160, y: 50 }
            ];

      // Create X-shaped cross
            var cross = document.createElement("div");
            cross.className = "gonioscopy-cross";
            diagram.appendChild(cross);

      // Create center circle
            var circle = document.createElement("div");
            circle.className = "gonioscopy-center";
            diagram.appendChild(circle);

            positions.forEach(function (pos) {
                var field = inputs.find((input) => {
                    var label = input.querySelector("label");
                    return label.textContent.includes(pos.label);
                });
                if (field) {
                    field.className = "gonioscopy-field";
                    field.style.left = pos.x + "px";
                    field.style.top = pos.y + "px";
                    field.setAttribute("data-position", eyeSide + " Eye, " + pos.label);
                    diagram.appendChild(field);
                }
            });

            return diagram;
        }

        function renderGonioscopyTest (parent, rightEyeInputs, leftEyeInputs) {
            var container = document.createElement("div");
            container.className = "gonioscopy-test-container";

            var leftEyeDiagram = createGonioscopyDiagram("Left", leftEyeInputs);
            var rightEyeDiagram = createGonioscopyDiagram("Right", rightEyeInputs);

            container.appendChild(leftEyeDiagram);
            container.appendChild(rightEyeDiagram);

            parent.appendChild(container);
            return parent;
        }

        function findItemWithText () {
            var targetTexts = ["MOTILITY TEST", "GONIOSCOPY EVALUATION"];
            const headers = document.querySelectorAll(".table-header");

            targetTexts.forEach((targetText) => {
                const headerWithText = Array.from(headers).find((header) =>
          header.textContent.toLowerCase().includes(targetText.toLowerCase())
        );
                if (headerWithText) {
                    const parentDiv = headerWithText.parentElement;
                    parentDiv.style.position = "relative";

                    const titles = parentDiv.querySelectorAll(".control-wrapper-content");
                    titles.forEach((title) => {
                        title.style.display = "flex";
                        title.style.justifyContent = "center";
                    });

                    const inputs = parentDiv.querySelectorAll(".form-builder-column-wrapper");

                    const rightEyeInputs = Array.from(inputs).filter((input, index) => index % 2 !== 0);
                    const leftEyeInputs = Array.from(inputs).filter((input, index) => index % 2 === 0);

                    if (targetText === "MOTILITY TEST") {
                        renderMotilityTest(parentDiv, rightEyeInputs, leftEyeInputs);
                    } else if (targetText === "GONIOSCOPY EVALUATION") {
                        renderGonioscopyTest(parentDiv, rightEyeInputs, leftEyeInputs);
                    }
                }
            });
        }

        var unMountReactContainer = function (formUuid) {
            var reactContainerElement = angular.element(document.getElementById(formUuid));
            reactContainerElement.on("$destroy", function () {
                unMountForm(document.getElementById(formUuid));
            });
        };

        function runPostRenderCustomisations (formName, formUuid) {
            $timeout(function () {
                findItemWithText();
                createPrescriptionTable();
                scheduleCreatePGTable(formName, formUuid);
            }, 0, false);
        }

        var controller = function ($scope) {
            var formUuid = $scope.form.formUuid;
            var formVersion = $scope.form.formVersion;
            var formName = $scope.form.formName;
            var formObservations = $scope.form.observations;
            var collapse = $scope.form.collapseInnerSections && $scope.form.collapseInnerSections.value;
            var validateForm = $scope.validateForm || false;
            var locale = $translate.use();

            if (!loadedFormDetails[formUuid]) {
                spinner.forPromise(
          formService.getFormDetail(formUuid, { v: "custom:(resources:(value))" }).then(function (response) {
              var formDetailsAsString = _.get(response, "data.resources[0].value");
              if (formDetailsAsString) {
                  var formDetails = JSON.parse(formDetailsAsString);
                  formDetails.version = formVersion;
                  loadedFormDetails[formUuid] = formDetails;
                  var formParams = { formName: formName, formVersion: formVersion, locale: locale, formUuid: formUuid };
                  $scope.form.events = formDetails.events;
                  spinner.forPromise(
                formService.getFormTranslations(formDetails.translationsUrl, formParams).then(
                  function (response) {
                      var formTranslations = !_.isEmpty(response.data) ? response.data[0] : {};
                      loadedFormTranslations[formUuid] = formTranslations;
                      $scope.form.component = renderWithControls(
                      formDetails,
                      formObservations,
                      formUuid,
                      collapse,
                      $scope.patient,
                      validateForm,
                      locale,
                      formTranslations
                    );
                  },
                  function () {
                      var formTranslations = {};
                      loadedFormTranslations[formUuid] = formTranslations;
                      $scope.form.component = renderWithControls(
                      formDetails,
                      formObservations,
                      formUuid,
                      collapse,
                      $scope.patient,
                      validateForm,
                      locale,
                      formTranslations
                    );
                  }
                )
              );
              }
              unMountReactContainer($scope.form.formUuid);
          })
        );
            } else {
                $timeout(
          function () {
              $scope.form.events = loadedFormDetails[formUuid].events;
              $scope.form.component = renderWithControls(
              loadedFormDetails[formUuid],
              formObservations,
              formUuid,
              collapse,
              $scope.patient,
              validateForm,
              locale,
              loadedFormTranslations[formUuid]
            );
              unMountReactContainer($scope.form.formUuid);
              runPostRenderCustomisations(formName, formUuid);
          },
          0,
          false
        );
            }

            $scope.$watch("form.collapseInnerSections", function () {
                var collapse = $scope.form.collapseInnerSections && $scope.form.collapseInnerSections.value;
                if (loadedFormDetails[formUuid]) {
                    $scope.form.component = renderWithControls(
            loadedFormDetails[formUuid],
            formObservations,
            formUuid,
            collapse,
            $scope.patient,
            validateForm,
            locale,
            loadedFormTranslations[formUuid]
          );
                    runPostRenderCustomisations(formName, formUuid);
                }
            });

            $scope.$watch("form.component", function (newValue) {
                if (newValue) {
                    runPostRenderCustomisations($scope.form.formName, $scope.form.formUuid);
                }
            });

            $scope.$on("$destroy", function () {
                if ($scope.$parent.consultation && $scope.$parent.consultation.observationForms) {
                    if ($scope.form.component) {
                        var formObservations = $scope.form.component.getValue();
                        $scope.form.observations = formObservations.observations;

                        var hasError = formObservations.errors;
                        if (!_.isEmpty(hasError)) {
                            $scope.form.isValid = false;
                        }
                    }
                }
            });
        };

        return {
            restrict: "E",
            scope: {
                form: "=",
                patient: "=",
                validateForm: "="
            },
            controller: controller
        };
    }
]);
