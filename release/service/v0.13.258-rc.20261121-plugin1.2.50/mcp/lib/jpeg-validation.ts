import jpeg from "jpeg-js";

export const jpegValidationProfile="strict_components_v1";
/** Decode all entropy/coefficients strictly. Returned pixels are discarded;
 * storage and MCP continue using the original authenticated JPEG bytes.
 */
export function validatedJpegDimensions(bytes:Uint8Array,width:number,height:number){
  const pixels=width*height;
  if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||pixels>4_200_000)throw new RangeError("Invalid expected JPEG dimensions");
  // jpeg-js accounts output allocation before component extraction. Removing
  // alpha saves exactly one byte/pixel. Reserve that saving against the old
  // 48MiB allowance so a matching-dimension image cannot become admissible only
  // because the output got smaller. Parsing/entropy limits remain unchanged.
  const memoryBudget=48-pixels/(1024*1024);
  const image=jpeg.decode(bytes,{useTArray:true,tolerantDecoding:false,maxResolutionInMP:4.2,maxMemoryUsageInMB:memoryBudget,formatAsRGBA:false,colorTransform:false});
  return {width:image.width,height:image.height};
}
