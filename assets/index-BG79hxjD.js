(function(){const n=document.createElement("link").relList;if(n&&n.supports&&n.supports("modulepreload"))return;for(const a of document.querySelectorAll('link[rel="modulepreload"]'))o(a);new MutationObserver(a=>{for(const i of a)if(i.type==="childList")for(const c of i.addedNodes)c.tagName==="LINK"&&c.rel==="modulepreload"&&o(c)}).observe(document,{childList:!0,subtree:!0});function r(a){const i={};return a.integrity&&(i.integrity=a.integrity),a.referrerPolicy&&(i.referrerPolicy=a.referrerPolicy),a.crossOrigin==="use-credentials"?i.credentials="include":a.crossOrigin==="anonymous"?i.credentials="omit":i.credentials="same-origin",i}function o(a){if(a.ep)return;a.ep=!0;const i=r(a);fetch(a.href,i)}})();const oe=`#version 300 es
precision highp float;
layout(location = 0) in vec2 a_pos;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`,ae=`#version 300 es
precision highp float;

uniform vec2 u_res;
uniform vec2 u_center;
uniform float u_scale;
uniform float u_iters;
uniform float u_time;
uniform float u_palette;
uniform float u_aspect;

out vec4 outColor;

vec3 palette(float t, float mode) {
  t = fract(t);
  if (mode < 0.5) {
    return 0.5 + 0.5 * cos(6.28318 * (t + vec3(0.00, 0.18, 0.33)) + vec3(0.2, 1.4, 2.1));
  } else if (mode < 1.5) {
    return 0.55 + 0.45 * cos(6.28318 * (t + vec3(0.05, 0.22, 0.40)) + vec3(1.8, 0.9, 0.3));
  } else if (mode < 2.5) {
    vec3 a = vec3(0.08, 0.14, 0.18);
    vec3 b = vec3(0.55, 0.85, 0.75);
    vec3 c = vec3(1.0, 0.8, 0.6);
    return a + b * pow(abs(sin(3.14159 * (t + c))), vec3(1.4));
  }
  return mix(
    vec3(0.02, 0.03, 0.06),
    vec3(1.0, 0.72, 0.35),
    smoothstep(0.0, 1.0, 0.5 + 0.5 * sin(t * 18.0))
  ) + 0.25 * cos(6.28318 * (t + vec3(0.1, 0.25, 0.4)));
}

void main() {
  // Use pixel-centered coords for stabler sampling
  vec2 pix = gl_FragCoord.xy - 0.5;
  vec2 uv = (pix / u_res) * 2.0 - 1.0;
  uv.x *= u_aspect;

  vec2 c = u_center + uv * u_scale;
  vec2 z = vec2(0.0);
  float i;
  float maxI = u_iters;

  for (i = 0.0; i < maxI; i++) {
    float zx2 = z.x * z.x;
    float zy2 = z.y * z.y;
    if (zx2 + zy2 > 256.0) break;
    z = vec2(zx2 - zy2, 2.0 * z.x * z.y) + c;
  }

  if (i >= maxI - 0.5) {
    outColor = vec4(0.01, 0.02, 0.03, 1.0);
    return;
  }

  float mag = length(z);
  float smoothI = i - log2(log2(max(mag, 1.0001))) + 4.0;
  float t = smoothI * 0.018 + u_time * 0.035;
  vec3 col = palette(t, u_palette);
  col += exp(-0.012 * smoothI) * 0.12 * vec3(0.4, 0.9, 0.85);
  col = pow(max(col, 0.0), vec3(0.92));
  outColor = vec4(col, 1.0);
}
`,ie=`
attribute vec2 a_pos;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`,ce=`
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform vec2 u_res;
uniform vec2 u_center;
uniform float u_scale;
uniform float u_iters;
uniform float u_time;
uniform float u_palette;
uniform float u_aspect;

vec3 palette(float t, float mode) {
  t = fract(t);
  if (mode < 0.5) {
    return 0.5 + 0.5 * cos(6.28318 * (t + vec3(0.00, 0.18, 0.33)) + vec3(0.2, 1.4, 2.1));
  } else if (mode < 1.5) {
    return 0.55 + 0.45 * cos(6.28318 * (t + vec3(0.05, 0.22, 0.40)) + vec3(1.8, 0.9, 0.3));
  } else if (mode < 2.5) {
    vec3 a = vec3(0.08, 0.14, 0.18);
    vec3 b = vec3(0.55, 0.85, 0.75);
    vec3 c = vec3(1.0, 0.8, 0.6);
    return a + b * pow(abs(sin(3.14159 * (t + c))), vec3(1.4));
  }
  return mix(
    vec3(0.02, 0.03, 0.06),
    vec3(1.0, 0.72, 0.35),
    smoothstep(0.0, 1.0, 0.5 + 0.5 * sin(t * 18.0))
  ) + 0.25 * cos(6.28318 * (t + vec3(0.1, 0.25, 0.4)));
}

void main() {
  vec2 pix = gl_FragCoord.xy - 0.5;
  vec2 uv = (pix / u_res) * 2.0 - 1.0;
  uv.x *= u_aspect;

  vec2 c = u_center + uv * u_scale;
  vec2 z = vec2(0.0);
  float i;
  float maxI = u_iters;

  for (i = 0.0; i < maxI; i++) {
    float zx2 = z.x * z.x;
    float zy2 = z.y * z.y;
    if (zx2 + zy2 > 256.0) break;
    z = vec2(zx2 - zy2, 2.0 * z.x * z.y) + c;
  }

  if (i >= maxI - 0.5) {
    gl_FragColor = vec4(0.01, 0.02, 0.03, 1.0);
    return;
  }

  float mag = length(z);
  float smoothI = i - log2(log2(max(mag, 1.0001))) + 4.0;
  float t = smoothI * 0.018 + u_time * 0.035;
  vec3 col = palette(t, u_palette);
  col += exp(-0.012 * smoothI) * 0.12 * vec3(0.4, 0.9, 0.85);
  col = pow(max(col, 0.0), vec3(0.92));
  gl_FragColor = vec4(col, 1.0);
}
`;function T(e,n,r){const o=e.createShader(n);if(e.shaderSource(o,r),e.compileShader(o),!e.getShaderParameter(o,e.COMPILE_STATUS)){const a=e.getShaderInfoLog(o);throw e.deleteShader(o),new Error(a||"Shader compile failed")}return o}function se(e,n,r){const o=T(e,e.VERTEX_SHADER,n),a=T(e,e.FRAGMENT_SHADER,r),i=e.createProgram();if(e.attachShader(i,o),e.attachShader(i,a),e.linkProgram(i),!e.getProgramParameter(i,e.LINK_STATUS))throw new Error(e.getProgramInfoLog(i)||"Program link failed");return e.deleteShader(o),e.deleteShader(a),i}function de(e,n,r){const o=e.createBuffer();if(e.bindBuffer(e.ARRAY_BUFFER,o),e.bufferData(e.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),e.STATIC_DRAW),r){const i=e.createVertexArray();return e.bindVertexArray(i),e.enableVertexAttribArray(0),e.vertexAttribPointer(0,2,e.FLOAT,!1,0,0),()=>e.bindVertexArray(i)}const a=e.getAttribLocation(n,"a_pos");return e.enableVertexAttribArray(a),e.vertexAttribPointer(a,2,e.FLOAT,!1,0,0),()=>{e.bindBuffer(e.ARRAY_BUFFER,o),e.enableVertexAttribArray(a),e.vertexAttribPointer(a,2,e.FLOAT,!1,0,0)}}function fe(e){const n=e.getShaderPrecisionFormat(e.FRAGMENT_SHADER,e.HIGH_FLOAT),r=n&&n.precision>=23;return{highp:!!r,minScale:r?12e-5:3e-4}}function X(e,n,r,o,a,i){const c=se(n,o,a),v=de(n,c,i),E=fe(n),l={res:n.getUniformLocation(c,"u_res"),center:n.getUniformLocation(c,"u_center"),scale:n.getUniformLocation(c,"u_scale"),iters:n.getUniformLocation(c,"u_iters"),time:n.getUniformLocation(c,"u_time"),palette:n.getUniformLocation(c,"u_palette"),aspect:n.getUniformLocation(c,"u_aspect")};function f(){const d=Math.min(window.devicePixelRatio||1,2),x=Math.max(1,Math.floor(window.innerWidth*d)),m=Math.max(1,Math.floor(window.innerHeight*d));return e.width!==x||e.height!==m?(e.width=x,e.height=m,n.viewport(0,0,x,m),!0):!1}function u({centerX:d,centerY:x,scale:m,iters:g,time:R,palette:b}){f(),n.useProgram(c),v(),n.uniform2f(l.res,e.width,e.height),n.uniform2f(l.center,d,x),n.uniform1f(l.scale,m),n.uniform1f(l.iters,g),n.uniform1f(l.time,R),n.uniform1f(l.palette,b),n.uniform1f(l.aspect,e.width/Math.max(1,e.height)),n.drawArrays(n.TRIANGLES,0,6)}return f(),u({centerX:-.7436438870371587,centerY:.13182590420531198,scale:.05,iters:120,time:0,palette:0}),{kind:r,resize:f,render:u,canvas:e,minScale:E.minScale,highp:E.highp}}function le(e){const n=e.parentElement,r=document.createElement("canvas");return r.id=e.id||"gl",r.setAttribute("aria-label",e.getAttribute("aria-label")||"マンデルブロ集合"),n.replaceChild(r,e),r}function ue(e){let n=!1;try{const o=e.getContext("webgl2",{antialias:!1,powerPreference:"high-performance",alpha:!1,preserveDrawingBuffer:!1});if(o)return n=!0,X(e,o,"webgl2",oe,ae,!0)}catch(o){console.warn("WebGL2 Mandelbrot failed:",o)}const r=n?le(e):e;try{const o=r.getContext("webgl",{antialias:!1,powerPreference:"high-performance",alpha:!1,preserveDrawingBuffer:!1})||r.getContext("experimental-webgl",{antialias:!1,alpha:!1});if(o)return X(r,o,"webgl1",ie,ce,!1)}catch(o){console.warn("WebGL1 Mandelbrot failed:",o)}return n?{kind:"failed",canvas:r,resize:()=>!1,render:()=>{}}:null}function me(e,n){e=(e+n*.035)%1,e<0&&(e+=1);const r=.5+.5*Math.cos(6.28318*(e+0)+.2),o=.5+.5*Math.cos(6.28318*(e+.18)+1.4),a=.5+.5*Math.cos(6.28318*(e+.33)+2.1);return[Math.max(0,Math.min(255,r*255)),Math.max(0,Math.min(255,o*255)),Math.max(0,Math.min(255,a*255))]}function pe(e){const n=e.getContext("2d",{alpha:!1,desynchronized:!0});if(!n)throw new Error("Canvas2D unavailable");let r=null;function o(){const i=Math.max(220,Math.floor(window.innerWidth*.42)),c=Math.max(320,Math.floor(window.innerHeight*.42));return e.width!==i||e.height!==c?(e.width=i,e.height=c,r=n.createImageData(i,c),!0):!1}function a({centerX:i,centerY:c,scale:v,iters:E,time:l}){o();const f=e.width,u=e.height;(!r||r.width!==f||r.height!==u)&&(r=n.createImageData(f,u));const d=r.data,x=f/u,m=Math.min(E,120);for(let g=0;g<u;g++){const R=c+((g+.5)/u*2-1)*v;for(let b=0;b<f;b++){const Q=i+((b+.5)/f*2-1)*x*v;let I=0,S=0,A=0;for(;A<m;A++){const N=I*I,Y=S*S;if(N+Y>16)break;const re=N-Y+Q;S=2*I*S+R,I=re}const p=(g*f+b)*4;if(A>=m){d[p]=3,d[p+1]=5,d[p+2]=8,d[p+3]=255;continue}const j=I*I+S*S,J=A-Math.log2(Math.log2(Math.max(j,1.0001)))+4,[ee,te,ne]=me(J*.018,l);d[p]=ee,d[p+1]=te,d[p+2]=ne,d[p+3]=255}}n.putImageData(r,0,0)}return{kind:"canvas2d",resize:o,render:a,canvas:e,minScale:5e-5}}const y=[{x:-.7436438870371587,y:.13182590420531198},{x:-.7487663670389055,y:.0657487739243988},{x:-.77568377,y:.13646737},{x:-1.768778833,y:-.001738827},{x:-.16070135,y:1.0375665},{x:-.5622799008959947,y:.6428147914776039},{x:.2817179216159643,y:.5771052841488505},{x:-.745428,y:.113009},{x:-.235125,y:.827215},{x:-.10109636384562,y:.95628651080914},{x:-.81159812898999,y:.18969156891408},{x:-.374978534,y:.659846321},{x:-1.25066,y:.02012},{x:.001643721971153,y:-.822467633298876}],L=1.8,D=.06,V=3.5,he=document.getElementById("zoomLabel"),xe=document.getElementById("iterLabel"),ye=document.getElementById("speedLabel"),F=document.getElementById("speedSlider"),H=document.getElementById("autoBtn"),ve=document.getElementById("autoIcon"),ge=document.getElementById("autoLabel"),be=document.getElementById("resetBtn"),Ie=document.getElementById("paletteBtn"),Se=document.getElementById("paletteCtlBtn"),_e=document.getElementById("swatch"),Me=document.getElementById("fadeVeil");let s=document.getElementById("gl");function we(){try{const r=ue(s);if(r&&r.kind!=="failed")return s=r.canvas||s,r;r&&r.canvas&&(s=r.canvas)}catch(r){console.warn(r)}const e=s.parentElement,n=document.createElement("canvas");return n.id="gl",n.setAttribute("aria-label","マンデルブロ集合"),e.replaceChild(n,s),s=n,pe(s)}const h=we(),w=h.minScale||8e-5,t={centerX:y[0].x,centerY:y[0].y,scale:L,siteIndex:0,auto:!0,speedNorm:.45,palette:0,zoomCarry:1,pointerIds:new Map,pinchStartDist:0,pinchStartScale:1,dragStart:null,needsRender:!0,fade:null,relayCount:0};function W(){return t.zoomCarry*(L/Math.max(t.scale,1e-30))}function ze(){const e=W();return e<1e3?`×${e.toFixed(e<10?1:0)}`:e<1e6?`×${(e/1e3).toFixed(1)}K`:e<1e9?`×${(e/1e6).toFixed(1)}M`:e<1e12?`×${(e/1e9).toFixed(1)}B`:e<1e15?`×${(e/1e12).toFixed(1)}T`:`×10^${Math.log10(e).toFixed(1)}`}function Ee(e){const n=Math.max(1,L/e);return h.kind==="canvas2d"?Math.min(220,Math.floor(100+28*Math.log2(n+1))):Math.min(720,Math.floor(220+48*Math.log2(n+1)))}function P(e){return e<=.001?0:.18+Math.pow(e,1.15)*2.6}function Ae(e){return e<=.001?"停止":`×${(P(e)/P(.45)).toFixed(1)}`}function z(){ye.textContent=Ae(t.speedNorm),F.value=String(Math.round(t.speedNorm*100))}function M(e){t.auto=e,H.setAttribute("aria-pressed",e?"true":"false"),ve.textContent=e?"◈":"▷",ge.textContent=e?"自動拡大":"再開"}function $(){t.palette=(t.palette+1)%4;const e=["conic-gradient(from 120deg, #3de0c5, #f0b45a, #ff6b5a, #3de0c5)","conic-gradient(from 40deg, #ff6b5a, #f0b45a, #ffe08a, #ff6b5a)","conic-gradient(from 200deg, #1bb8a0, #7dffd4, #3de0c5, #1bb8a0)","conic-gradient(from 90deg, #f0b45a, #fff1c9, #ff8a5b, #f0b45a)"];_e.style.background=e[t.palette],t.needsRender=!0}function _(e){Me.style.opacity=String(Math.max(0,Math.min(1,e)))}function Le(){const e=t.scale;t.zoomCarry*=D/Math.max(e,1e-30),t.siteIndex=(t.siteIndex+1)%y.length;const n=y[t.siteIndex];t.centerX=n.x,t.centerY=n.y,t.scale=D,t.relayCount+=1,t.needsRender=!0}function q(){t.fade||(t.fade={phase:"out",t:0})}function K(){t.siteIndex=0,t.centerX=y[0].x,t.centerY=y[0].y,t.scale=L,t.zoomCarry=1,t.fade=null,t.relayCount=0,_(0),M(!0),t.speedNorm<=0&&(t.speedNorm=.45),z(),t.needsRender=!0}function G(e,n){const r=s.getBoundingClientRect(),o=(e-r.left)/r.width*2-1,a=-((n-r.top)/r.height*2-1),i=s.width/Math.max(1,s.height);return{x:t.centerX+o*i*t.scale,y:t.centerY+a*t.scale}}function O(e,n,r){if(t.fade)return;const o=G(e,n),a=t.scale*r;if(a<=w){q();return}t.scale=Math.min(V,a);const i=G(e,n);t.centerX+=o.x-i.x,t.centerY+=o.y-i.y,t.needsRender=!0}function U(){const e=[...t.pointerIds.values()];return e.length<2?0:Math.hypot(e[0].x-e[1].x,e[0].y-e[1].y)}function Re(e){e.addEventListener("pointerdown",r=>{e.setPointerCapture(r.pointerId),t.pointerIds.set(r.pointerId,{x:r.clientX,y:r.clientY}),t.pointerIds.size===1?t.dragStart={x:r.clientX,y:r.clientY,cx:t.centerX,cy:t.centerY}:t.pointerIds.size===2&&(t.pinchStartDist=U(),t.pinchStartScale=t.scale,t.dragStart=null)},{passive:!0}),e.addEventListener("pointermove",r=>{if(t.pointerIds.has(r.pointerId)){if(t.pointerIds.set(r.pointerId,{x:r.clientX,y:r.clientY}),t.pointerIds.size===2&&t.pinchStartDist>0){const o=U(),a=[...t.pointerIds.values()],i=(a[0].x+a[1].x)/2,c=(a[0].y+a[1].y)/2,v=Math.min(V,Math.max(w*1.05,t.pinchStartScale*(t.pinchStartDist/Math.max(o,1))));O(i,c,v/t.scale)}else if(t.dragStart&&t.pointerIds.size===1){const o=s.getBoundingClientRect(),a=(r.clientX-t.dragStart.x)/o.width*2,i=-((r.clientY-t.dragStart.y)/o.height*2),c=s.width/Math.max(1,s.height);t.centerX=t.dragStart.cx-a*c*t.scale,t.centerY=t.dragStart.cy-i*t.scale,t.needsRender=!0}}},{passive:!0});const n=r=>{t.pointerIds.delete(r.pointerId),t.pointerIds.size<2&&(t.pinchStartDist=0),t.pointerIds.size===0&&(t.dragStart=null)};e.addEventListener("pointerup",n),e.addEventListener("pointercancel",n),e.addEventListener("wheel",r=>{r.preventDefault(),O(r.clientX,r.clientY,Math.exp(r.deltaY*.0015))},{passive:!1})}Re(s);F.addEventListener("input",()=>{t.speedNorm=Number(F.value)/100,z(),t.speedNorm>0&&!t.auto&&M(!0)});H.addEventListener("click",()=>{t.auto?(M(!1),t.speedNorm=0):(M(!0),t.speedNorm<=0&&(t.speedNorm=.45)),z()});be.addEventListener("click",K);Ie.addEventListener("click",$);Se.addEventListener("click",$);window.addEventListener("resize",()=>{h.resize(),t.needsRender=!0});h.resize();z();M(!0);_(0);window.__SHINSO__={getState:()=>{var e;return{scale:t.scale,zoom:W(),siteIndex:t.siteIndex,relayCount:t.relayCount,auto:t.auto,fading:!!t.fade,fadePhase:((e=t.fade)==null?void 0:e.phase)??null,centerX:t.centerX,centerY:t.centerY,renderer:h.kind,minScale:w}},setSpeed:e=>{t.speedNorm=Math.max(0,Math.min(1,e)),z(),t.speedNorm>0&&M(!0)},reset:K};console.info("[深層] renderer:",h.kind,"minScale:",w);let k=performance.now(),C=0;function B(e){const n=P(t.speedNorm);if(n<=0)return;t.scale*=Math.exp(-n*e);const r=y[t.siteIndex],o=1-Math.exp(-.12*e);t.centerX+=(r.x-t.centerX)*o,t.centerY+=(r.y-t.centerY)*o,t.needsRender=!0}function Z(e){const n=Math.min(.05,(e-k)/1e3);if(k=e,t.fade){const o=t.fade.phase==="out"?2.8:2.2;t.fade.t+=n*o,t.fade.phase==="out"?(t.auto&&B(n),_(Math.min(1,t.fade.t)),t.fade.t>=1&&(Le(),t.fade={phase:"in",t:0},_(1))):(_(1-Math.min(1,t.fade.t)),t.auto&&B(n),t.fade.t>=1&&(t.fade=null,_(0)))}else t.auto&&(B(n),t.scale<=w&&q());h.resize()&&(t.needsRender=!0);const r=Ee(t.scale);if(C+=n,C>.1&&(C=0,he.textContent=ze(),xe.textContent=String(r)),t.needsRender||t.auto||t.fade){try{h.render({centerX:t.centerX,centerY:t.centerY,scale:t.scale,iters:r,time:e*.001,palette:t.palette})}catch(o){console.error("render failed",o)}t.needsRender=!1}requestAnimationFrame(Z)}requestAnimationFrame(Z);
