# Factory AtomS3 Lite security baseline

Status: awaiting 2–3 actual untouched boards and connection details from the owner. No samples collected by this change. assertSecurity remains unchanged and rejects nonzero or unknown security state.

## Read-only collection

1. Identify each board by a private local label, exact AtomS3 Lite/C124 hardware revision, supplier/lot and untouched provenance. Separate new factory boards from previously flashed/provisioned boards. Two or three samples are an initial check, not evidence for all production batches.
2. Fix and record the esptool/esptool-js version, OS, connection type and actual read-only command/API. Use the ROM security-information query without starting the installer. Review command options before execution; no erase, write, burn, protect, key-generation, provisioning or stub execution is part of this sample.
3. Record `chipId`, `flags` (numeric and hex), `flashCryptCnt`, the complete `keyPurposes` array, secure-download state, flash size and any read errors. Decode flag/key-purpose meanings against the documentation for the exact chip and tool version; raw nonzero values are not automatically safe or dangerous.
4. Repeat the read to establish consistency. Preserve raw reports privately with timestamp and tool version. Do not publish MAC addresses, device identities, raw keys or complete Flash/NVS dumps.
5. Compare the observed fields with the current predicate. If factory defaults cause rejection, retain that failure and determine the exact bit/field meaning before proposing a narrow, reviewed rule change. Unknown or unreadable state must still fail closed.

## Sample record

| Field | Required evidence |
| --- | --- |
| Board label / revision / lot | Owner-provided label and provenance |
| Factory untouched | How this was confirmed; do not infer from packaging alone |
| Host and tool version | Exact version, OS, physical connection |
| Read method | Actual read-only API/command and reset behavior |
| Security fields | chipId, flags, flashCryptCnt, every keyPurpose, secure-download state |
| Repeat observation | A second consistent read or retained mismatch/error |
| Current predicate result | Pass or security-state, with reason |
| Interpretation | Chip/tool documentation supporting each nonzero field |

No example zeros are accepted as measured values. Acceptance requires actual samples and review; neither this document nor synthetic unit fixtures establish factory calibration. The separate full DIY eFuse lifecycle audit (first boot, pairing, restart, upgrade and recovery) is still required before firmware release.
