export enum RoundStatus {
    Pending = 'pending',
    Active = 'active',
    Ended = 'ended',
}

export type RoundType =
    | 'round_table'
    | 'banishment_vote'
    | 'banishment_result'
    | 'killing_vote'
    | 'breakfast'
    | 'minigame';

export enum GameStatus {
    Draft = 'draft',
    Pending = 'pending',
    Active = 'active',
    Ended = 'ended',
}

export interface Game {
    id: string;
    name: string;
    status: GameStatus;
    current_round_number: number | null;
    created_at: string | null;
    host: string | null;
}

export interface GameRound {
    id: string;
    game_id: string;
    round: number | null;
    type: RoundType | null;
    status: RoundStatus | null;
}

export interface Player {
    id: string;
    full_name: string;
    eliminated: boolean;
    headshot_url?: string | null;
    role?: string | null;
    game_id?: string;
}
