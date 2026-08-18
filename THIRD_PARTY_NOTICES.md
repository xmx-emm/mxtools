# Third-party notices and rights scope

The root `LICENSE` applies only to original MxTools material for which 小萌新
(`xmx-emm`) owns the relevant rights. It does not replace or restrict licenses
that apply to third-party code, models, images, documentation, product names,
or trademarks.

## APEX Q calculation code

`src-tauri/src/game/apex_theta.rs` identifies itself as a Rust port of
[`NYTN02/APEX_thetacalculation`](https://github.com/NYTN02/APEX_thetacalculation)
`calculate.cpp`. The upstream repository at commit
`4e59ac5c7895c0a486a0979067377861daf2018c` did not contain a license when
reviewed on 2026-07-29. Attribution and a public GitHub repository do not by
themselves grant permission to copy, adapt, or redistribute the code.

On 2026-06-13, the upstream author gave the MxTools maintainer written
permission in a Bilibili private message to integrate the angle algorithm into
the linked MxTools application, with attribution. The maintainer retains the
original message as permission evidence. MxTools relies on that project-specific
permission for this port; it is not a general license for unrelated reuse and
does not place the upstream work under the root MxTools license.

## Vendored OCR code

`src-tauri/vendor/ppocr-rs` is derived from the Apache-2.0-licensed
[`meibel-ai/paddle-ocr-rs`](https://github.com/meibel-ai/paddle-ocr-rs) and
[`mg-chao/paddle-ocr-rs`](https://github.com/mg-chao/paddle-ocr-rs) projects,
with further modifications. Its Apache License 2.0 text is preserved in
`src-tauri/vendor/ppocr-rs/LICENSE`.

OCR models and dictionaries downloaded at runtime are separate works. Their
source and license information must remain available with the downloader or
the distributed model package; the root MxTools license does not relicense
them.

## Other dependencies

JavaScript and Rust dependencies retain the licenses declared by their
respective packages. The manifests and lockfiles identify the exact dependency
set. Binary distributors remain responsible for carrying all notices and
license texts required by those dependencies. The external local path crate
`windows_tool` declares the MIT license and is not relicensed by MxTools.

## Names, trademarks, and media

All copyright, trademark, and other intellectual property rights in icons and
logos of other software, games, platforms, and brands displayed by MxTools
remain with their respective owners. Their display solely identifies the
corresponding product or service and does not imply affiliation, authorization,
sponsorship, or endorsement. Screenshots, videos, QR-code branding, and other
third-party media remain subject to their owners' rights and any applicable
platform terms.

The Apex Legends preview images under `src/assets/images/apex/`, including the
laser-sight preview background re-encoded from the `ui.rpak` UI image
`rui/menu/laser_options/laser_example_1`, are derived from Apex Legends game
content. Apex Legends and its assets are the property of Electronic Arts Inc.
and Respawn Entertainment. They are displayed solely to identify and preview
the corresponding in-game settings and are not covered by the root MxTools
license.

The Razer triple-headed snake icon displayed by MxTools is sourced from
<https://assets2.razerzone.com/images/razer-legal/razer-logo-icon.png>.
Razer's trademark use guidelines are available at
<https://www.razer.com/legal/trademark-use-guidelines>.
RAZER is the trademark or registered trademark of Razer Inc. All copyright,
trademark, and other intellectual property rights in the icon remain with
Razer Inc.
