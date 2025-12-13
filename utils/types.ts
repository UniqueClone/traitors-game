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
    | 'minigame'
    | 'endgame_vote';

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
    cur_round_number: number | null;
    created_at: string | null;
    host: string | null;
    roles_revealed?: boolean | null;
    last_revealed_round?: number | null;
    kitchen_signal_version?: number | null;
    minigame_signal_version?: number | null;
    shield_points_threshold?: number | null;
}

export interface GameRound {
    id: string;
    game_id: string;
    round: number | null;
    type: RoundType | null;
    status: RoundStatus | null;
    winning_group_index?: number | null;
}

export interface Player {
    id: string;
    full_name: string;
    eliminated: boolean;
    headshot_url?: string | null;
    role?: string | null;
    game_id?: string;
    has_shield?: boolean | null;
    shield_winner?: boolean | null;
}
