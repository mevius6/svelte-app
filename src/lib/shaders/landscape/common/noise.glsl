// ============================================================
// Noise utilities — depends on math.glsl
// ============================================================

float hash(vec2 p) {
    p = fract(p * vec2(127.1, 311.7));
    p += dot(p, p + 74.51);
    return fract(p.x * p.y);
}

float vnoise(vec2 p) {
    vec2 i=floor(p), f=fract(p), u=f*f*(3.0-2.0*f);
    return mix(mix(hash(i),          hash(i+vec2(1,0)), u.x),
               mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x), u.y);
}

float cloudBaseFbm(vec2 p) {
    float v=0.0,a=0.5; vec2 s=vec2(100.0);
    for(int i=0;i<4;i++){v+=a*vnoise(p);p=p*2.1+s;a*=0.48;}
    return v;
}

float cloudDetailFbm(vec2 p) {
    float v=0.0,a=0.5; vec2 s=vec2(100.0);
    // AI: keep the primary cloud body at 4 octaves, but trim the secondary detail layer to 3 where the visual impact is smaller.
    for(int i=0;i<3;i++){v+=a*vnoise(p);p=p*2.1+s;a*=0.48;}
    return v;
}
