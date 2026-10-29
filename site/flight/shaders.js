// GLSL for the flight strip. The page is white paper at every tier: colours here are the
// colours the page shows. Metals are drawn as value within the ink (a dark core, a bright band
// that travels), never as light added to white.
//
// Materials are indexed 0 none (ink), 1 bronze, 2 silver, 3 gold, 4 Title foil. Every colour
// arrives as a uniform (from js/materials.js), so the strip and the slider share one palette.

export const COMMON = /* glsl */ `
  uniform vec3 uDeep[5]; uniform vec3 uMid[5]; uniform vec3 uLight[5]; uniform vec3 uHi[5];
  uniform vec3 uFoil[6];
  uniform float uMatFrom, uMatTo, uSweepX;   // a tier change sweeps tail -> nose: x below uSweepX is the new material
  uniform vec4 uPulse[3];                    // x position along the aeroplane, strength, material, white
  uniform float uTime;

  vec3 foil(float h){
    h = fract(h) * 6.;
    float f = fract(h); f = f * f * (3. - 2. * f);
    if (h < 1.) return mix(uFoil[0], uFoil[1], f);
    if (h < 2.) return mix(uFoil[1], uFoil[2], f);
    if (h < 3.) return mix(uFoil[2], uFoil[3], f);
    if (h < 4.) return mix(uFoil[3], uFoil[4], f);
    if (h < 5.) return mix(uFoil[4], uFoil[5], f);
    return mix(uFoil[5], uFoil[0], f);
  }
  // A material's tone k (0 deep .. 1 mid .. 2 light .. 3 highlight); Title runs the foil along h.
  vec3 tone(float m, float k, float h){
    int i = int(m + .5);
    vec3 d = uDeep[0], md = uMid[0], l = uLight[0], hi = uHi[0];
    if (i == 1) { d = uDeep[1]; md = uMid[1]; l = uLight[1]; hi = uHi[1]; }
    else if (i == 2) { d = uDeep[2]; md = uMid[2]; l = uLight[2]; hi = uHi[2]; }
    else if (i == 3) { d = uDeep[3]; md = uMid[3]; l = uLight[3]; hi = uHi[3]; }
    else if (i == 4) { vec3 c = foil(h); d = c * .62; md = c * .86; l = mix(c, vec3(1.), .3); hi = mix(c, vec3(1.), .78); }
    return k < 1. ? mix(d, md, k) : k < 2. ? mix(md, l, k - 1.) : mix(l, hi, k - 2.);
  }
  // The material at x, partway through a sweep.
  vec3 toneAt(float x, float k, float h){
    float w = smoothstep(uSweepX + 3., uSweepX - 3., x);
    return mix(tone(uMatFrom, k, h), tone(uMatTo, k, h), w);
  }
  // Seat pulses running tail -> nose: strength at x, and its colour.
  vec4 pulseAt(float x, float h){
    vec4 o = vec4(0.);
    for (int i = 0; i < 3; i++) {
      vec4 p = uPulse[i];
      if (p.y < .002) continue;
      float b = exp(-pow((x - p.x) / (5.5 + 3. * p.w), 2.)) * p.y;
      vec3 c = mix(tone(p.z, 2.6, h), vec3(1.), p.w * .7);
      o.rgb = mix(o.rgb, c, b / max(o.a + b, 1e-4));
      o.a = max(o.a, b);
    }
    return o;
  }
`;

// ------------------------------------------------------------------ the aeroplane
export const PLANE_VS = /* glsl */ `
  attribute float aMat; attribute float aEdge;
  varying vec3 vN; varying vec3 vW; varying vec3 vP; varying float vMat; varying float vEdge;
  void main(){
    vN = normalize(mat3(modelMatrix) * normal);
    vec4 w = modelMatrix * vec4(position, 1.);
    vW = w.xyz; vP = position; vMat = aMat; vEdge = aEdge;
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;
export const PLANE_FS = /* glsl */ `
  ${COMMON}
  uniform vec3 uCamPos; uniform vec3 uKey;
  uniform float uMetal, uFoilAmt, uLE, uBeacon, uStrobe, uNight, uEngine;
  uniform vec3 uShadeTint;
  varying vec3 vN; varying vec3 vW; varying vec3 vP; varying float vMat; varying float vEdge;
  void main(){
    vec3 n = normalize(vN);
    vec3 V = normalize(uCamPos - vW);
    float fv = dot(n, V), fw = fwidth(fv);
    float contour = fw > 1e-6 ? 1. - smoothstep(fw * .7, fw * 1.6, abs(fv)) : 0.;
    if (!gl_FrontFacing) n = -n;
    float k = smoothstep(.06, .94, clamp(dot(n, normalize(uKey)) * .5 + .5, 0., 1.));
    float ndv = abs(fv);
    int m = int(vMat + .5);
    float x = vP.x, h = x * .012 - uTime * .03;
    // paper, shaded only by facing; under a coloured sky the shade side takes the sky's tint
    vec3 col = mix(mix(vec3(.862,.862,.851), uShadeTint, .55), vec3(1.), k);

    // polished metal: the tier's ramp by facing, a bright reflected band that slides as it banks
    if (m == 0 && uMetal > .002) {
      vec3 R = reflect(-V, n);
      // band-limited: where the reflection changes faster than the band is wide (thin curved
      // surfaces, a banking fuselage), the band widens and dims instead of strobing between facets
      float fr = fwidth(R.y);
      float wb = max(.07, fr * 2.5), wd = max(.1, fr * 2.5);
      float band = exp(-pow((R.y - .16) / wb, 2.)) * (.07 / wb);
      float dark = exp(-pow((R.y + .06) / wd, 2.)) * (.1 / wd);
      // mostly bright steel, a little of the tier in it; the reflected band is the tier's own highlight
      vec3 lo = mix(tone(2., 1.7, h), toneAt(x, 1.7, h), .3), up = mix(tone(2., 2.7, h), toneAt(x, 2.7, h), .3);
      vec3 metal = mix(lo, up, k);
      metal = mix(metal, toneAt(x, 3., h), band);
      metal = mix(metal, mix(tone(2., 1.2, h), toneAt(x, 1.2, h), .4), dark * .55);
      col = mix(col, metal, uMetal * (.35 + .65 * band + .3 * dark));
    }
    // Title: the airframe becomes foil, a thin-film sheen by viewing angle
    if (m == 0 && uFoilAmt > .002) {
      vec3 film = mix(foil(ndv * 1.35 + h * 1.6), vec3(1.), .38);
      col = mix(col, film, uFoilAmt * (.16 + .42 * pow(1. - ndv, 1.5)));
    }
    if (m == 1) col = mix(vec3(.17,.18,.21), vec3(.32,.34,.40), k * .6);              // glass
    if (m == 6) col = vec3(.21,.215,.235);                                            // a duct seen dark
    if (m == 7) col = vec3(.36,.37,.40);                                              // fan face
    if (m == 5) col = mix(vec3(.66,.66,.66), vec3(.86,.86,.85), k);                   // the plug
    if (m == 5 || m == 6) col = mix(col, mix(toneAt(x, 2.4, h), vec3(1.), .35), uEngine); // the engines glow in the tier's colour
    if (m == 2 || m == 3 || m == 4) {                                                 // lights: the one lit accent
      vec3 lc = m == 2 ? vec3(.86,.16,.14) : m == 3 ? vec3(.12,.66,.36) : vec3(.92);
      float on = m == 4 ? uStrobe : (m == 2 ? max(uBeacon, .55) : .8);
      col = mix(mix(vec3(.7), lc, .6), mix(lc, vec3(1.), .25), on);
    }
    // gold warms the leading edges, as gold leaf: value, not glow
    float le = vEdge * uLE;
    col = mix(col, mix(toneAt(x, 2.2, h), toneAt(x, 2.9, h), k), clamp(le, 0., 1.) * .8);
    // a seat's pulse runs over the airframe as a band of the tier's colour
    vec4 p = pulseAt(x, h);
    col = mix(col, p.rgb, p.a * .42);
    // the outline in the tier's deepest tone
    vec3 ink = toneAt(x, .15, h);
    // against the night the outline turns to light, so the airframe stays crisp
    ink = mix(ink, mix(toneAt(x, 2.6, h), vec3(1.), .5), uNight);
    col = mix(col, mix(toneAt(x, 2.8, h), vec3(1.), .4), pow(1. - ndv, 3.) * uNight * .7);
    ink = mix(ink, p.rgb, p.a * .8);
    if (m == 0 || m == 5) col = mix(col, ink, contour);
    gl_FragColor = vec4(col, 1.);
  }`;

export const LINE_VS = /* glsl */ `
  attribute float aTone; varying float vTone; varying vec3 vP;
  void main(){ vTone = aTone; vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`;
export const LINE_FS = /* glsl */ `
  ${COMMON}
  uniform float uNight;
  varying float vTone; varying vec3 vP;
  void main(){
    float h = vP.x * .012 - uTime * .03;
    // ink -> crease -> seam: deep, mid, light of the tier's material
    vec3 c = vTone < .5 ? toneAt(vP.x, .15, h) : vTone < 1.5 ? toneAt(vP.x, 1., h) : toneAt(vP.x, 1.9, h);
    // panel seams and creases are one pixel wide; keep their contrast with the paper low enough
    // that a line hopping a pixel row as the aeroplane banks doesn't read as a flicker
    if (vTone > .5) c = mix(c, vec3(.97), vTone < 1.5 ? .25 : .45);
    c = mix(c, mix(toneAt(vP.x, 2., h), vec3(.8), .3), uNight * (vTone < .5 ? .9 : .5));
    vec4 p = pulseAt(vP.x, h);
    gl_FragColor = vec4(mix(c, p.rgb, p.a * .85), 1.);
  }`;

// ------------------------------------------------------------------ wind
// Speed lines: streaks on a cone whose apex sits just ahead of the nose and whose axis is the
// aeroplane's own line of flight (they live in its frame, so they follow its bank and drift).
// Each streak runs outward from the apex and back past the airframe, so the whole field
// converges on the nose and wraps evenly round the aeroplane, with a clear zone round it.
// uLA[i] = (unused, y, z of where the line crosses the aeroplane's centre plane, radius);
// uLB[i] = (reveal 0..1, speed jitter, length scale, seed).
export const STREAM_VS = /* glsl */ `
  #define NL 64
  uniform vec4 uLA[NL]; uniform vec4 uLB[NL];
  uniform float uTravel, uFlow, uWidth, uStrokeLen, uZc;
  uniform vec3 uApex;
  uniform vec2 uRes;
  uniform vec4 uPulse[3];
  attribute float aLine; attribute float aU; attribute float aSide;
  varying float vX, vSide, vT, vHalf, vFade, vSeed;
  void main(){
    int i = int(aLine + .5);
    vec4 A = uLA[i], B = uLB[i];
    vec3 Q = vec3(0., A.y, A.z);
    vec3 dir = Q - uApex; float dQ = length(dir); dir /= dQ;
    // each streak rides outward from just ahead of the nose and is born again there
    float span = 120.;
    float run = mod(B.w * span + uFlow * (.88 + .24 * B.y), span);
    float d0 = dQ * .42;                                   // born just ahead of the nose, never inside it
    float fade = smoothstep(0., 24., run) * smoothstep(span, span - 40., run) * B.x;
    float len = uStrokeLen * B.z;
    float dc = d0 + run;
    float df = max(dc - len * .5, d0 * .9), db = dc + len * .5;
    vec4 vf = modelViewMatrix * vec4(uApex + dir * df, 1.), vb = modelViewMatrix * vec4(uApex + dir * db, 1.);
    // keep it in front of the camera: cut it where it would pass the near plane
    if (vb.z > -uZc) db = mix(df, db, clamp((vf.z + uZc) / (vf.z - vb.z), 0., 1.));
    float d = mix(df, db, aU);
    vec3 P = uApex + dir * d;
    vec4 p = projectionMatrix * modelViewMatrix * vec4(P, 1.);
    vec4 q = projectionMatrix * modelViewMatrix * vec4(P + dir, 1.);
    vec2 sp = p.xy / p.w * uRes, sq = q.xy / q.w * uRes;
    vec2 sd = normalize(sq - sp + vec2(1e-6, 0.));
    float pul = 0.;
    for (int k = 0; k < 3; k++) pul = max(pul, exp(-pow((P.x - uPulse[k].x) / 8., 2.)) * uPulse[k].y);
    float hw = .5 * uWidth * (.75 + .5 * fract(B.w * 7.3)) * (1. + 1.2 * pul);
    p.xy += vec2(-sd.y, sd.x) * aSide * (hw + 1.) / uRes * p.w;
    gl_Position = p;
    vX = P.x; vSide = aSide; vT = aU; vHalf = hw; vFade = fade; vSeed = B.w;
  }`;
export const STREAM_FS = /* glsl */ `
  ${COMMON}
  uniform float uCore, uNight, uInk;
  varying float vX, vSide, vT, vHalf, vFade, vSeed;
  void main(){
    float across = abs(vSide) * (vHalf + 1.);
    float a = clamp(vHalf + .5 - across, 0., 1.) * vFade;
    // the head (aft end, vT = 1) is bright, the tail fades out towards the front
    float head = smoothstep(.0, .9, vT);
    a *= smoothstep(0., .5, vT) * smoothstep(1., .94, vT);
    float h = vX * .006 - uTime * .05;                    // Title: one continuous foil, not a hue per streak
    float r = across / max(vHalf, .5);
    vec3 c = mix(toneAt(vX, uCore, h), toneAt(vX, uCore + 1.1, h), smoothstep(.25, 1., r));
    c = mix(c, toneAt(vX, 2.9, h), pow(head, 6.) * .85);                 // the head catches the light
    // under the night sky the streaks are light
    c = mix(c, mix(toneAt(vX, 2.4, h), vec3(1.), .35 * head), uNight);
    vec4 p = pulseAt(vX, h);
    c = mix(c, p.rgb, p.a);
    gl_FragColor = vec4(c, a * mix(uInk, 1., head * .5 + .5));
  }`;

// ------------------------------------------------------------------ trails
// Contrails behind the engines and vortex trails off the wingtips, laid along where the sources
// have been (the air is still, so a trail stays where it was left). aS: metres behind the source,
// aV: -1..1 across. uKind 0 contrail (soft vapour, world width), 1 vortex (crisp line, pixel width).
export const TRAIL_VS = /* glsl */ `
  attribute float aS; attribute float aV;
  varying float vS; varying float vV; varying vec3 vW;
  void main(){ vS = aS; vV = aV; vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
export const TRAIL_FS = /* glsl */ `
  ${COMMON}
  uniform float uKind, uAmt, uLen, uSeed, uTravel, uNight, uCore, uAA, uBlur;
  varying float vS; varying float vV; varying vec3 vW;
  float hash12(vec2 p){ vec3 q = fract(vec3(p.xyx) * .1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
  float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
    return mix(mix(hash12(i), hash12(i + vec2(1, 0)), f.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), f.x), f.y); }
  void main(){
    if (uAmt < .002) discard;
    float s = vS, v = vV, air = uTravel - s;
    float fade = smoothstep(uLen, uLen * .45, s);
    float x = -20. - s * .4;                                  // where the trail sits for the tier sweep
    float h = air * .004 - uTime * .05;
    if (uKind < .5) {
      // contrail: forms ~8 m back, spreads and breaks into puffs; white vapour shaded by the sky
      float form = smoothstep(5., 22., s);
      // detail finer than the air moves in one frame is faded out, so it can't strobe
      float k1 = clamp(1. - uBlur / 14., 0., 1.), k2 = clamp(1. - uBlur / 3.5, 0., 1.);
      float n = .5 + (noise(vec2(air * .11, v * 1.6 + uSeed * 9.)) - .5) * .65 * (.3 + .7 * k1)
                   + (noise(vec2(air * .31, v * 3.1 + uSeed * 3.)) - .5) * .35 * k2;
      float body = exp(-pow(v / (.6 + .3 * n), 2.) * 2.4) * (.5 + .8 * n);
      float a = (1. - exp(-body * form * fade * uAmt * 1.7)) * .9;
      vec3 c = mix(vec3(.97,.975,.985), mix(toneAt(x, 1.8, h), vec3(.7,.74,.8), .4), smoothstep(-.5, 1., v) * .55 + (1. - n) * .2);
      c = mix(c, mix(toneAt(x, 2.6, h), vec3(1.), .4), uNight);         // luminous vapour at night
      gl_FragColor = vec4(c, a);
    } else {
      // vortex: a crisp metal line with a highlight running down it
      float a = clamp((1. - abs(v)) / uAA, 0., 1.) * fade * smoothstep(0., 4., s) * uAmt;
      // the highlight is fixed in the air, so the trail carries it back at air speed: smear it over
      // the distance the air moved this frame (a motion blur) so it glides instead of strobing
      float wb = 4., we = sqrt(wb * wb + uBlur * uBlur * .5);
      float g = fract(air / 60. + uSeed) - .5;
      float band = exp(-pow(g * 60. / we, 2.)) * (wb / we);
      vec3 c = toneAt(x, uCore + .4, h);
      c = mix(c, toneAt(x, 2.6, h), band * .6);
      c = mix(c, mix(toneAt(x, 2.5, h), vec3(1.), .3 * band), uNight);
      vec4 p = pulseAt(x, h);
      gl_FragColor = vec4(mix(c, p.rgb, p.a), a);
    }
  }`;

// ------------------------------------------------------------------ the sky
// A full-bleed sky behind everything, by ray direction: a gradient from the zenith to a glow
// along the horizon and a cloud deck below, with a soft vignette. At the Title tiers it is night
// with an aurora in the slider's foil. Colours come in per tier from js/flight.js.
export const SKY_VS = /* glsl */ `
  varying vec2 vNdc;
  void main(){ vNdc = position.xy; gl_Position = vec4(position.xy, 1., 1.); }`;
export const SKY_FS = /* glsl */ `
  ${COMMON}
  uniform mat4 uInvProj; uniform mat4 uCamWorld;
  uniform vec3 uTop, uHor, uLow;
  uniform float uSky, uAurora, uStars, uPress, uVig;
  varying vec2 vNdc;
  float hash12(vec2 p){ vec3 q = fract(vec3(p.xyx) * .1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
  float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
    return mix(mix(hash12(i), hash12(i + vec2(1, 0)), f.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), f.x), f.y); }
  void main(){
    if (uSky < .002) { gl_FragColor = vec4(1.); return; }
    vec4 pv = uInvProj * vec4(vNdc, 1., 1.);
    vec3 r = normalize((uCamWorld * vec4(normalize(pv.xyz / pv.w), 0.)).xyz);
    float e = r.y;                                        // elevation of the ray
    float az = atan(r.z, r.x);
    vec3 sky = mix(uHor, uTop, smoothstep(-.03, .24, e));
    vec3 below = mix(uHor, uLow, smoothstep(.0, -.25, e));
    vec3 c = e > 0. ? sky : below;
    // the horizon glows a little brighter ahead, broad and low, never a spot
    float ahead = pow(max(r.x, 0.), 3.);
    c = mix(c, mix(uHor, vec3(1.), .3), exp(-abs(e) * 16.) * (.18 + .25 * ahead) * (1. - .7 * uAurora));
    // a soft cloud deck below the horizon
    float deck = noise(vec2(az * 9., 1. / max(-e, .02) * .9 - uTime * .05)) * smoothstep(-.01, -.12, e);
    c = mix(c, mix(uHor, uLow, .5), deck * .25);
    // aurora: curtains of the slider's foil in the upper sky, slowly drifting
    if (uAurora > .002) {
      float x = az * 3.2 + uTime * .03;
      float curtain = noise(vec2(x * 2.2, uTime * .08)) * .7 + noise(vec2(x * 5.1 + 7., uTime * .15)) * .3;
      float band = smoothstep(.02, .1, e) * smoothstep(.36, .14, e + .05 * sin(x * 1.7));
      float rays = .55 + .45 * noise(vec2(x * 24., e * 3. - uTime * .2));
      vec3 hue = foil(az * .45 + e * .9 + uTime * .02);
      c += hue * pow(curtain, 1.6) * band * rays * uAurora * .9;
      // stars, sparse and fine
      vec2 g = vec2(az * 140., e * 140.);
      float s = hash12(floor(g));
      float st = step(.985, s) * smoothstep(.45, .05, length(fract(g) - .5)) * smoothstep(.0, .15, e);
      c += vec3(.8, .85, 1.) * st * uStars * .6;
    }
    // the pressure pulse as the barrier breaks: the whole sky lifts, briefly
    c += uPress * mix(vec3(.16, .14, .1), vec3(.1, .13, .22), uAurora);   // lifts the sky's own colour, not to white
    // vignette, deliberate and soft
    float v = dot(vNdc * vec2(.75, 1.), vNdc * vec2(.75, 1.));
    c *= 1. - uVig * smoothstep(.2, 1.6, v);
    gl_FragColor = vec4(mix(vec3(1.), c, uSky), 1.);
  }`;

// ------------------------------------------------------------------ breaking the sound barrier
// The bow shock: a condensation cone with its apex just ahead of the radome, opening back over
// the forward fuselage, as if the aeroplane punches through it. A band of vapour runs back down
// the cone and thins out before the wing root; the shell is depth-tested against the airframe,
// so the fuselage hides the far side and the near side is drawn over it. aU: 0 apex .. 1 back.
export const VAPOR_VS = /* glsl */ `
  attribute float aU; attribute float aA;
  uniform float uBoomT, uBoomS;
  varying float vU; varying float vA; varying vec3 vN; varying vec3 vW;
  void main(){
    vec3 p = position;
    float grow = 1. + .28 * (1. - exp(-uBoomT * 3.));
    p.yz *= grow * mix(1., uBoomS, aU);
    vU = aU; vA = aA;
    vN = normalize(mat3(modelMatrix) * normal);
    vec4 w = modelMatrix * vec4(p, 1.); vW = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;
export const VAPOR_FS = /* glsl */ `
  ${COMMON}
  uniform vec3 uCamPos; uniform float uBoomT, uBoom, uBoomMat;
  varying float vU; varying float vA; varying vec3 vN; varying vec3 vW;
  float hash12(vec2 p){ vec3 q = fract(vec3(p.xyx) * .1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
  float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
    return mix(mix(hash12(i), hash12(i + vec2(1, 0)), f.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), f.x), f.y); }
  void main(){
    if (uBoom < .002) discard;
    float edge = 1. - abs(dot(normalize(vN), normalize(uCamPos - vW)));
    // wisps streaming back along the cone, wrapping round it seamlessly
    float n = noise(vec2(vA * 24., vU * 6. - uBoomT * 4.)) * .6 + noise(vec2(vA * 64., vU * 15. - uBoomT * 7.)) * .4;
    // the vapour band: born at the nose, sweeping back and thinning before the wing root
    float uc = .18 + .7 * (1. - exp(-uBoomT * 2.6));
    float band = exp(-pow((vU - uc) / (.2 + .18 * uBoomT), 2.));
    float shape = smoothstep(0., .12, vU) * smoothstep(1., .82, vU);
    float a = band * shape * (.3 + 1.25 * n * n) * (.35 + .9 * pow(edge, .8)) * uBoom * exp(-uBoomT * 1.4);
    a = clamp(a, 0., .9);
    vec3 c = mix(vec3(.82,.86,.92), vec3(1.), smoothstep(.2, .8, n) * .8 + .2 * edge);
    c = mix(c, tone(uBoomMat, 2.5, vA + uBoomT * .3), .3 * (1. - n));     // the tier's colour in its thin edges
    gl_FragColor = vec4(c, a);
  }`;
// The shock ring: a crisp line running out through the sky, in the plane across the flight path.
export const RING_VS = /* glsl */ `
  varying vec2 vQ;
  void main(){ vQ = position.yz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`;
export const RING_FS = /* glsl */ `
  ${COMMON}
  uniform float uBoomT, uBoom, uRingR, uBoomMat, uRing2;
  varying vec2 vQ;
  void main(){
    if (uBoom < .002) discard;
    float r = length(vQ);
    float R = uRingR * (1. - exp(-uBoomT * 2.4));
    float w = .18 + .5 * uBoomT, fw = fwidth(r);
    float we = max(w, fw * 1.2);
    float ring = exp(-pow((r - R) / we, 2.) * 2.) * (w / we);
    float wake = exp(-pow((r - R * .86) / (we * 4.), 2.)) * .18;          // a soft trailing band inside it
    // the climax sends a second ring after the first
    float t2 = max(uBoomT - .22, 0.), R2 = uRingR * .8 * (1. - exp(-t2 * 2.4));
    float ring2 = exp(-pow((r - R2) / we, 2.) * 2.) * (w / we) * uRing2 * step(.001, t2);
    float a = (ring + wake + ring2 * .8) * uBoom;
    vec3 tint = tone(uBoomMat, 2.4, atan(vQ.y, vQ.x) / 6.2832 + uBoomT * .3);
    vec3 c = mix(vec3(1.), tint, clamp((1. - ring) * .7 + ring2 * .5, 0., 1.));
    gl_FragColor = vec4(c, clamp(a, 0., .95));
  }`;
