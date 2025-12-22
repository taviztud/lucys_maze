const HIGH_SCORE_KEY = 'lucys_maze_high_score';

export class ScoreManager {
    /**
     * Get the current high score from localStorage
     */
    static getHighScore(): number {
        try {
            const stored = localStorage.getItem(HIGH_SCORE_KEY);
            return stored ? parseInt(stored, 10) : 0;
        } catch {
            return 0;
        }
    }

    /**
     * Save a new high score if it beats the current record
     */
    static setHighScore(score: number): boolean {
        try {
            const current = this.getHighScore();
            if (score > current) {
                localStorage.setItem(HIGH_SCORE_KEY, score.toString());
                return true;
            }
            return false;
        } catch {
            return false;
        }
    }

    /**
     * Check if a score is a new high score
     */
    static isNewHighScore(score: number): boolean {
        return score > this.getHighScore();
    }

    /**
     * Reset the high score (for testing)
     */
    static reset(): void {
        try {
            localStorage.removeItem(HIGH_SCORE_KEY);
        } catch {
            // Ignore errors
        }
    }
}
