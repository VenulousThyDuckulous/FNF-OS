import { useCallback, useMemo } from 'react';
import { PlayerStage } from '../components/PlayerStage';
import { createDemoAudio, createDemoChart, DEMO_TITLE } from '../lib/player/demo';
import { COMPAT_RUNTIME } from '../lib/player/profile';
import { useNavigate } from '../router';

/**
 * Built-in test song.
 *
 * Runs the real runtime - same chart parser, same judging, same renderer, same
 * audio clock - against a chart and instrumental generated in the browser. It
 * exists so the playback path can be exercised without shipping a mod, and so a
 * user can tell whether their browser can decode audio at all.
 */
export function PlayerLabPage(): JSX.Element {
  const navigate = useNavigate();
  const chart = useMemo(() => createDemoChart(), []);
  const loadAudio = useCallback(async (ctx: AudioContext) => {
    return { instrumental: createDemoAudio(ctx), voices: null };
  }, []);

  return (
    <PlayerStage
      chart={chart}
      title={DEMO_TITLE}
      subtitle={`${COMPAT_RUNTIME.name} · synthesised test audio`}
      difficulty="normal"
      autoPlay
      loadAudio={loadAudio}
      onExit={() => navigate('/settings')}
    />
  );
}
