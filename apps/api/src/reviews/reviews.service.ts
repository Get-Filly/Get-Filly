import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

export type ReviewSource = 'google' | 'tripadvisor' | 'thefork' | 'iens';

export type Review = {
  id: string;
  source: ReviewSource;
  rating: number;
  title: string | null;
  body: string | null;
  author: string | null;
  review_date: string | null;
  response_text: string | null;
  responded_at: string | null;
};

@Injectable()
export class ReviewsService {
  constructor(private readonly supabase: SupabaseService) {}

  async findAll(restaurantId: string): Promise<Review[]> {
    const { data, error } = await this.supabase.client
      .from('reviews')
      .select(
        'id, source, rating, title, body, author, review_date, response_text, responded_at',
      )
      .eq('restaurant_id', restaurantId)
      .order('review_date', { ascending: false });

    if (error) throw new InternalServerErrorException(error.message);
    return (data ?? []) as Review[];
  }
}
