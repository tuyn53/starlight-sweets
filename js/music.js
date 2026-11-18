// === BGM：程序化合成可爱循环曲（零素材、Web Audio）===
// 曲风：C 大调 · 112 BPM · 8 小节无缝循环。八音盒音色 + 柔和琶音 + 轻低音 + 沙锤。
// 和弦：C - G - Am - F / C - G - F - G（末小节停属和弦，循环回主和弦产生解决感）。
// 与技术要点：lookahead 调度器（setInterval 25ms + 提前 150ms 排音符）保证节奏稳定，
// 不受主线程卡顿影响；复用 Sound 的 AudioContext，避免多个 context 抢占音频设备。
const Music = (() => {
  const BPM = 112;
  const BEAT = 60 / BPM;          // 一拍时长（秒）
  const SIX  = BEAT / 4;          // 一个 16 分音符时长
  const LOOKAHEAD = 0.15;         // 提前调度窗口（秒）
  const TICK_MS = 25;             // 调度器轮询间隔（毫秒）

  let enabled = true;
  try{
    const s=JSON.parse(localStorage.getItem('ns_music')||'{}');
    if(s.enabled!==undefined) enabled=!!s.enabled;
  }catch(_){}

  let ac=null, master=null, analyser=null, started=false;
  let playing=false, timer=null, step=0, nextStepTime=0, ticking=false;
  let buf=null;

  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

  // 每小节：root=低音根音 MIDI，chord=三和弦 MIDI，lead=8 个八分音符旋律（null=留白呼吸）
  const SONG = [
    { root:48, chord:[60,64,67], lead:[76,74,72,74,76,null,79,null] }, // 1 C   E5 D5 C5 D5 E5 · G5
    { root:43, chord:[59,62,67], lead:[74,72,71,72,74,null,79,null] }, // 2 G   D5 C5 B4 C5 D5 · G5
    { root:45, chord:[57,60,64], lead:[72,71,69,71,72,null,76,null] }, // 3 Am  C5 B4 A4 B4 C5 · E5
    { root:41, chord:[57,60,65], lead:[69,72,77,76,74,72,69,null] },   // 4 F   A4 C5 F5 E5 D5 C5 A4
    { root:48, chord:[60,64,67], lead:[76,79,81,79,76,74,72,null] },   // 5 C   E5 G5 A5 G5 E5 D5 C5
    { root:43, chord:[59,62,67], lead:[74,77,79,77,74,72,71,null] },   // 6 G   D5 F5 G5 F5 D5 C5 B4
    { root:45, chord:[57,60,64], lead:[72,76,81,76,72,71,69,null] },   // 7 Am  C5 E5 A5 E5 C5 B4 A4
    { root:43, chord:[59,62,67], lead:[71,74,79,77,76,74,71,null] },   // 8 G   B4 D5 G5 F5 E5 D5 B4
  ];
  const STEPS_PER_BAR = 16;
  const TOTAL_STEPS = SONG.length * STEPS_PER_BAR;

  // 音色：八音盒主旋律（正弦基频 + 2 次泛音，快起快落，带一点金属清亮感）
  function playBell(freq, t, dur, vol){
    const g=ac.createGain();
    const o1=ac.createOscillator(); o1.type='sine'; o1.frequency.value=freq;
    const o2=ac.createOscillator(); o2.type='sine'; o2.frequency.value=freq*2;
    const g2=ac.createGain(); g2.gain.value=0.16;
    o2.connect(g2); g2.connect(g);
    o1.connect(g); g.connect(master);
    g.gain.setValueAtTime(0.0001,t);
    g.gain.exponentialRampToValueAtTime(vol,t+0.008);
    g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
    o1.start(t); o2.start(t);
    o1.stop(t+dur+0.03); o2.stop(t+dur+0.03);
  }
  // 低音：柔软正弦长音
  function playBass(freq, t, dur, vol){
    const g=ac.createGain(), o=ac.createOscillator();
    o.type='sine'; o.frequency.value=freq;
    o.connect(g); g.connect(master);
    g.gain.setValueAtTime(0.0001,t);
    g.gain.exponentialRampToValueAtTime(vol,t+0.03);
    g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
    o.start(t); o.stop(t+dur+0.03);
  }
  // 琶音：轻三角波，短促点缀
  function playArp(freq, t, dur, vol){
    const g=ac.createGain(), o=ac.createOscillator();
    o.type='triangle'; o.frequency.value=freq;
    o.connect(g); g.connect(master);
    g.gain.setValueAtTime(0.0001,t);
    g.gain.exponentialRampToValueAtTime(vol,t+0.005);
    g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
    o.start(t); o.stop(t+dur+0.02);
  }
  // 沙锤：短噪声 + 高通，模拟"沙"的质感
  let shakerBuf=null;
  function playShaker(t, vol){
    if(!shakerBuf){
      const n=Math.floor(ac.sampleRate*0.055);
      shakerBuf=ac.createBuffer(1,n,ac.sampleRate);
      const d=shakerBuf.getChannelData(0);
      for(let i=0;i<n;i++) d[i]=(Math.random()*2-1)*Math.pow(1-i/n,3.5);
    }
    const s=ac.createBufferSource(); s.buffer=shakerBuf;
    const hp=ac.createBiquadFilter(); hp.type='highpass'; hp.frequency.value=5200;
    const g=ac.createGain(); g.gain.value=vol;
    s.connect(hp); hp.connect(g); g.connect(master);
    s.start(t);
  }

  // 建图：master 总线 → analyser → 扬声器；master 另送一路 delay 制造空间感
  function build(){
    if(master) return;
    // 总音量压到 0.62：背景音乐低于音效，避免盖住攻击/拾取等反馈
    master=ac.createGain(); master.gain.value=0.62;
    const delay=ac.createDelay(0.6); delay.delayTime.value=0.19;
    const fb=ac.createGain(); fb.gain.value=0.2;
    const wet=ac.createGain(); wet.gain.value=0.16;
    master.connect(delay); delay.connect(fb); fb.connect(delay); // 反馈回路
    delay.connect(wet);
    analyser=ac.createAnalyser(); analyser.fftSize=1024;
    master.connect(analyser); wet.connect(analyser);   // 干声 + 湿声都进分析器
    analyser.connect(ac.destination);
    buf=new Float32Array(analyser.fftSize);
  }

  function scheduleStep(globalStep, time){
    const bar = Math.floor(globalStep / STEPS_PER_BAR) % SONG.length;
    const s   = globalStep % STEPS_PER_BAR;
    const data = SONG[bar];

    // 主旋律：八分音符（偶数格），每音时值接近一拍，带连奏感
    if(s % 2 === 0){
      const n = data.lead[s / 2];
      if(n != null) playBell(mtof(n), time, BEAT * 1.05, 0.052);
    }
    // 低音：每小节第 1、3 拍
    if(s === 0 || s === 8) playBass(mtof(data.root), time, BEAT * 1.8, 0.085);
    // 琶音：每拍一个和弦音，三音循环上行
    if(s % 4 === 0) playArp(mtof(data.chord[(s / 4) % 3] + 12), time, 0.2, 0.014);
    // 沙锤：每拍轻点
    if(s % 4 === 0) playShaker(time, 0.007);
  }

  // lookahead 调度：始终比当前时间提前一点排好音符，避免 setTimeout 抖动
  function scheduler(){
    if(!playing || !ac) return;
    while(nextStepTime < ac.currentTime + LOOKAHEAD){
      scheduleStep(step, nextStepTime);
      nextStepTime += SIX;
      step = (step + 1) % TOTAL_STEPS;
    }
  }

  return {
    get enabled(){ return enabled; },
    setEnabled(v){
      enabled=!!v;
      try{ localStorage.setItem('ns_music', JSON.stringify({enabled})); }catch(_){}
      if(enabled) this.start(); else this.stop();
    },
    start(){
      if(playing || !enabled) return;
      const a = Sound.unlock();           // 复用音效模块的 AudioContext 并 resume
      if(!a) return;
      ac = a;
      build();
      playing = true;
      // AudioContext 可能是 suspended，resume() 异步完成后再起步，避免音符排到已过去的时间点
      const begin = () => {
        if(!playing || ticking) return;
        ticking = true;
        if(!started){ step = 0; started = true; }
        nextStepTime = ac.currentTime + 0.12;
        scheduler();
        timer = setInterval(scheduler, TICK_MS);
      };
      if(ac.state === 'suspended'){
        const p = ac.resume();
        if(p && p.then) p.then(begin, begin); else begin();
        setTimeout(begin, 400);           // 兜底：resume 迟迟不决议也能起播
      } else begin();
    },
    stop(){
      playing = false;
      ticking = false;
      if(timer){ clearInterval(timer); timer = null; }
    },
    // 供验证/调试：当前输出的 RMS 音量（0 表示无声）
    level(){
      if(!analyser || !buf) return 0;
      analyser.getFloatTimeDomainData(buf);
      let sum=0; for(let i=0;i<buf.length;i++) sum += buf[i]*buf[i];
      return Math.sqrt(sum / buf.length);
    },
    _debug(){ return { playing, enabled, bpm:BPM, bars:SONG.length, totalSteps:TOTAL_STEPS, ctxState: ac && ac.state }; }
  };
})();
