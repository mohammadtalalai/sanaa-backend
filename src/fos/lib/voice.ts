/** Records a short voice question in the browser (complete file, sent once recording stops). */
export async function recordAudio(maxSeconds = 30): Promise<{ stop: () => Promise<Blob> }> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const type = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((t) => MediaRecorder.isTypeSupported(t)) ?? '';
  const recorder = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const done = new Promise<Blob>((resolve) => {
    recorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      resolve(new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }));
    };
  });
  recorder.start();
  const timer = setTimeout(() => recorder.state === 'recording' && recorder.stop(), maxSeconds * 1000);
  return {
    stop: () => {
      clearTimeout(timer);
      if (recorder.state === 'recording') recorder.stop();
      return done;
    },
  };
}
