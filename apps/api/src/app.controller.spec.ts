import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { SupabaseService } from './supabase/supabase.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        // AppController hangt sinds 2026 ook van SupabaseService af
        // (supabase-status-endpoint). Voor de getHello-smoke-test
        // volstaat een lege stub — we raken de client hier niet aan.
        { provide: SupabaseService, useValue: {} },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('getHello', () => {
    it('geeft de Get-Filly-API-greeting terug', () => {
      expect(appController.getHello()).toBe('Get Filly API draait 👋');
    });
  });
});
