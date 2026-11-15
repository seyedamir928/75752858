import * as THREE from 'three';

/**
 * Authentic Bodycam optical lens post-processing shader:
 * - Subtle wide-angle barrel fish-eye warp (authentic chest-mounted Axon lens)
 * - Subtle peripheral chromatic aberration
 * - Micro-sensor film grain & tactical vignette
 * - Crisp exposure/contrast curve
 */
export const BodycamLensShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uDistortion: { value: 0.085 },
    uChromatic: { value: 0.0022 },
    uGrain: { value: 0.042 },
    uDamage: { value: 0.0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uDistortion;
    uniform float uChromatic;
    uniform float uGrain;
    uniform float uDamage;
    varying vec2 vUv;

    float hash12(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }

    vec2 barrelDistort(vec2 uv, float k) {
      vec2 centered = uv - 0.5;
      float r2 = dot(centered, centered);
      return 0.5 + centered * (1.0 + k * r2) / (1.0 + k * 0.24);
    }

    void main() {
      vec2 uv = barrelDistort(vUv, uDistortion);
      if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
        gl_FragColor = vec4(0.01, 0.01, 0.012, 1.0);
        return;
      }

      vec2 dir = uv - 0.5;
      float dist = length(dir);
      float ca = (uChromatic + uDamage * 0.005) * dist * 2.0;

      float r = texture2D(tDiffuse, uv - dir * ca).r;
      float g = texture2D(tDiffuse, uv).g;
      float b = texture2D(tDiffuse, uv + dir * ca).b;
      vec3 col = vec3(r, g, b);

      // Subtle bodycam sensor contrast & cool shadow tint
      col = mix(col, col * col * (3.0 - 2.0 * col), 0.16);
      col += vec3(-0.004, 0.002, 0.006) * (1.0 - clamp(dot(col, vec3(0.333)), 0.0, 1.0));

      // Sensor grain
      float n = (hash12(uv * 900.0 + fract(uTime * 17.3) * 100.0) - 0.5) * uGrain;
      col += n;

      // Subtle lens vignette + damage crimson pulse
      float vig = smoothstep(0.88, 0.34, dist);
      col *= mix(0.62, 1.0, vig);
      col = mix(col, vec3(0.55, 0.03, 0.03), uDamage * smoothstep(0.2, 0.72, dist) * 0.65);

      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }
  `,
};
