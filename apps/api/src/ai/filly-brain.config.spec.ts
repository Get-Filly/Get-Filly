import { checkCopyLength, mapCampaignTypeToChannel } from './filly-brain.config';

describe('filly-brain.config', () => {
  describe('checkCopyLength', () => {
    // Mail: 400–1200 tekens (zie CHANNEL_RULES.mail.copyLength).
    it('keurt een body binnen de bandbreedte goed', () => {
      const v = checkCopyLength('mail', 'x'.repeat(600));
      expect(v.ok).toBe(true);
      expect(v.verdict).toBe('ok');
    });
    it('detecteert te kort', () => {
      const v = checkCopyLength('mail', 'x'.repeat(100));
      expect(v.ok).toBe(false);
      expect(v.verdict).toBe('too_short');
    });
    it('detecteert te lang', () => {
      const v = checkCopyLength('mail', 'x'.repeat(2000));
      expect(v.ok).toBe(false);
      expect(v.verdict).toBe('too_long');
    });
    it('trimt vóór het meten', () => {
      const v = checkCopyLength('mail', `   ${'x'.repeat(600)}   `);
      expect(v.chars).toBe(600);
    });
  });

  describe('mapCampaignTypeToChannel', () => {
    it('mapt mail en whatsapp 1-op-1', () => {
      expect(mapCampaignTypeToChannel('mail')).toBe('mail');
      expect(mapCampaignTypeToChannel('whatsapp')).toBe('whatsapp');
    });
    it('social → instagram_feed als default', () => {
      expect(mapCampaignTypeToChannel('social')).toBe('instagram_feed');
    });
    it('social respecteert het expliciete platform', () => {
      expect(mapCampaignTypeToChannel('social', 'facebook')).toBe('facebook');
      expect(mapCampaignTypeToChannel('social', 'tiktok')).toBe('tiktok');
      expect(mapCampaignTypeToChannel('social', 'google_business')).toBe(
        'google_business',
      );
      expect(mapCampaignTypeToChannel('social', 'instagram')).toBe(
        'instagram_feed',
      );
    });
  });
});
