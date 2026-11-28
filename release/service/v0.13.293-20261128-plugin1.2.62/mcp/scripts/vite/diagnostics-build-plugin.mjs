// Production builds must not package diagnostic fixture pixels or widget HTML.
// The runtime gates also reject diagnostic routes. Disabled code fails closed.
const prefix="\0sayso-disabled-diagnostics:";
const modules={
 "benchmark-frame":'export const benchmarkCaseIDs=[]; const disabled=()=>{throw Error("DIAGNOSTICS_NOT_BUILT")}; export {disabled as benchmarkCase,disabled as benchmarkFrame,disabled as benchmarkJpegFrame,disabled as benchmarkCarrier};',
 "benchmark-resources":'export const benchmarkResource=()=>null;',
 "VoiceBenchmark":'export default function VoiceBenchmark(){return null;}'
};
export function diagnosticsBuildPlugin(enabled){return {name:"sayso-diagnostic-build-boundary",enforce:"pre",resolveId(source){if(enabled)return null;const match=source.replaceAll("\\","/").match(/(?:^|\/)(benchmark-frame|benchmark-resources|VoiceBenchmark)(?:\.tsx?)?(?:\?.*)?$/);return match?prefix+match[1]:null;},load(id){if(id.startsWith(prefix))return modules[id.slice(prefix.length)];return null;}};}
