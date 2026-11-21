"""Offline cross-party fixture generator; requires macOS clang and ESP-IDF cJSON.

Compiles the actual Guard::info_json and the unmodified configuration prefix of
identity_load (before NVS access). No device, networking, or provisioned key is used.
Board identity, clocks and readiness callbacks below are synthetic test inputs.
"""
import argparse
import hashlib
import json
import pathlib
import subprocess
import tempfile

p = argparse.ArgumentParser()
p.add_argument('--firmware-root', type=pathlib.Path, required=True)
p.add_argument('--idf-path', type=pathlib.Path, required=True)
p.add_argument('--output', type=pathlib.Path, required=True)
a = p.parse_args()
root = a.firmware_root.resolve()
source = (root / 'main/board_identity.cpp').read_text()
identity = source[source.index('void identity_load(){'):source.index('    if(nvs_flash_init()')]
guard = root / 'components/bridge_core'
paths = ['main/board_identity.cpp', 'main/Kconfig.projbuild',
         'components/bridge_core/guard.cpp', 'components/bridge_core/include/bridge_core.hpp',
         'boards/c124-production.defaults', 'boards/c124-test-iphone11.defaults']
result = {'firmware_commit': subprocess.check_output(['git', '-C', str(root), 'rev-parse', 'HEAD'], text=True).strip(),
          'source_sha256': {s: hashlib.sha256((root / s).read_bytes()).hexdigest() for s in paths},
          'generator': 'tests/fixtures/generate-firmware-info.py',
          'synthetic_inputs': 'fixed UUIDs, uptime=1000, lease_floor=0, readiness=true; no NVS or real keys',
          'samples': []}
assert result['firmware_commit'] == 'c12806abb91066627add3b3ea659aa285a0ba01f'
with tempfile.TemporaryDirectory() as directory:
    work = pathlib.Path(directory)
    cj = a.idf_path / 'components/json/cJSON'
    subprocess.run(['clang', '-c', str(cj / 'cJSON.c'), '-I', str(cj), '-o', str(work / 'cJSON.o')], check=True)
    for profile, filename, ingress in [('production-usb', 'c124-production.defaults', 'USB_NCM'),
                                        ('test-dual', 'c124-test-iphone11.defaults', 'WIFI_STA')]:
        config = (root / 'boards' / filename).read_text()
        defines = '\n'.join('#define ' + line.split('=')[0] + ' 1' for line in config.splitlines()
                            if line.startswith('CONFIG_') and line.endswith('=y'))
        # Kconfig.projbuild: SB_ROUTED_INPUT defaults y for either current profile.
        assert 'default y if SB_DUAL_INPUT || SB_PROFILE_PRODUCTION || SB_PROFILE_TEST_IPHONE11' in (root / 'main/Kconfig.projbuild').read_text()
        defines += '\n#define CONFIG_SB_ROUTED_INPUT 1\n'
        harness = '''#include "bridge_core.hpp"
#include <iostream>
''' + defines + '''
namespace platform {
sb::BoardConfig config;
std::string uuid(){return "00000000-0000-4000-8000-000000000002";}
''' + identity + '''}
}
int main(){
 platform::identity_load(); auto c=platform::config;
 c.hardware_id="00000000-0000-4000-8000-000000000001"; c.provisioned=true;
 c.system_search_route_ready=[](sb::RequestIngress){return true;};
 sb::Guard guard(c,[]{return uint64_t(1000);},[](const sb::Action&,const std::function<bool()>&){return sb::ExecutionResult{};},[]{return true;},platform::uuid);
 sb::Request r; r.method="GET";r.path="/v1/info";r.nonce="00000000-0000-4000-8000-000000000003";
 r.ingress=sb::RequestIngress::''' + ingress + ''';
 r.signature=sb::hmac256(c.key,sb::request_canonical(r.method,r.path,r.boot_id,r.session_id,r.sequence,r.nonce,r.body));
 auto out=guard.handle(r); if(out.status!=200)return 1;std::cout<<out.body;
}
'''
        (work / 'fixture.cpp').write_text(harness)
        subprocess.run(['clang++', '-std=c++17', '-Wno-deprecated-declarations', str(work / 'fixture.cpp'),
                        str(guard / 'guard.cpp'), str(guard / 'crypto.cpp'), str(guard / 'midi_wire.cpp'),
                        str(work / 'cJSON.o'), '-I', str(guard / 'include'), '-I', str(cj), '-o', str(work / 'fixture')], check=True)
        info = json.loads(subprocess.check_output([str(work / 'fixture')], text=True))
        assert info['firmware_profile'] == profile
        result['samples'].append({'profile': profile, 'ingress': ingress, 'info': info})
a.output.parent.mkdir(parents=True, exist_ok=True)
a.output.write_text(json.dumps(result, indent=2) + '\n')
print('Generated two firmware info fixtures from pinned source.')
