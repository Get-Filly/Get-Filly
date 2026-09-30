import {
  checkCopyLength,
  mapCampaignTypeToChannel,
} from './filly-brain.config';

describe('filly-brain.config', () => {
  describe('checkCopyLength', () => {
    // Facebook: 250–500 tekens (zie CHANNEL_RULES.facebook.copyLength).
    it('keurt een body binnen de bandbreedte goed', () => {
      const v = checkCopyLength('facebook', 'x'.repeat(400));
      expect(v.ok).toBe(true);
      expect(v.verdict).toBe('ok');
    });
    it('detecteert te kort', () => {
      const v = checkCopyLength('facebook', 'x'.repeat(100));
      expect(v.ok).toBe(false);
      expect(v.verdict).toBe('too_short');
    });
    it('detecteert te lang', () => {
      const v = checkCopyLength('facebook', 'x'.repeat(2000));
      expect(v.ok).toBe(false);
      expect(v.verdict).toBe('too_long');
    });
    it('trimt vóór het meten', () => {
      const v = checkCopyLength('facebook', `   ${'x'.repeat(400)}   `);
      expect(v.chars).toBe(400);
    });
  });

  describe('mapCampaignTypeToChannel', () => {
    it('valt voor oude mail- en whatsapp-campagnes terug op het Instagram-profiel', () => {
      expect(mapCampaignTypeToChannel('mail')).toBe('instagram_feed');
      expect(mapCampaignTypeToChannel('whatsapp')).toBe('instagram_feed');
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
