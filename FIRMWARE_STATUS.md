# DIY firmware publication status

Current hardware scope: **DIY AtomS3 Lite / C124 only**. Own-manufactured hardware, production certificates and factory provisioning are not in the current plan.

The ESP firmware source and firmware binary are not included in this repository. The browser installer is included, but its release channel remains unavailable. The intended future stable DIY firmware source license is FSL-1.1-ALv2, subject to the actual dependency and redistribution obligations; it is not yet a firmware release.

The current local source lock identifies ESP-IDF 5.5.2, esp_tinyusb 1.7.6, TinyUSB 0.21.0~2 and led_strip 2.5.5. Direct-license evidence is Apache-2.0 for esp_tinyusb/led_strip and MIT for TinyUSB. ESP-IDF has component-specific third-party terms in addition to its main Apache-2.0 license. No Arduino-ESP32 direct dependency was found in the inspected manifest/CMake files.

A complete linked-component BOM/map, binary component notices and final build review are still required. Absence of a direct GPL/LGPL declaration is not proof that no such material is linked. Build tools and firmware-linked components must be classified separately.

The bounded source scan did not establish a production secret leak; it is not a binary/NVS-backup clearance. The examined identity code reads a local key from NVS and does not by itself prove first-boot key generation, manufacturing trust tiers or a hardware-rooted identity. No such completed features are advertised here.

Reproducibility is also unverified. Before distribution, freeze the actual DIY source and dependency/toolchain inputs, collect the final link map and notices, build independently twice in clean environments, and compare the complete distributed image hashes with the signed manifest. Do not call a single successful build reproducible.

Primary SDK licensing reference: https://docs.espressif.com/projects/esp-idf/en/v5.5.2/esp32s3/COPYRIGHT.html . This status document is not legal clearance or hardware acceptance.
