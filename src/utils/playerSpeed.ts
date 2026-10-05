import { CONFIG } from '../Config';

/**
 * Duración de cada paso de Lucy según el nivel.
 * Fase 1 (niveles 1-10): aceleración rápida (-20ms por nivel)
 * Fase 2 (niveles 11-34): aceleración moderada (-5ms por nivel)
 * Fase 3 (niveles 35+): aceleración mínima (-1ms por nivel hasta 60ms)
 */
export function calculateStepDuration(level: number): number {
    const {
        PLAYER_BASE_DURATION_MS: baseMs,
        PLAYER_STEP_DEC_PER_LEVEL: fastDecPerLevel,
        PLAYER_STEP_DEC_SLOW: slowDecPerLevel,
        PLAYER_STEP_DEC_TINY: tinyDecPerLevel,
        PLAYER_PHASE1_MAX_LEVEL: phase1Limit,
        PLAYER_PHASE2_MAX_LEVEL: phase2Limit,
        PLAYER_MIN_STEP_DURATION_MS: minMs
    } = CONFIG.PERFORMANCE;

    const phase1Duration = baseMs - phase1Limit * fastDecPerLevel;
    const phase2Duration = phase1Duration - (phase2Limit - phase1Limit) * slowDecPerLevel;

    let duration: number;
    if (level <= phase1Limit) {
        duration = baseMs - level * fastDecPerLevel;
    } else if (level <= phase2Limit) {
        duration = phase1Duration - (level - phase1Limit) * slowDecPerLevel;
    } else {
        duration = phase2Duration - (level - phase2Limit) * tinyDecPerLevel;
    }

    return Math.max(minMs, duration);
}
