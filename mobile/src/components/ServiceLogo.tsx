import React from 'react';
import { View, Text, StyleSheet, Image, ImageSourcePropType } from 'react-native';

// ── 전체 PNG 로고 (카탈로그 99종 전부) ──
const LOGOS: Record<string, ImageSourcePropType> = {
  'Netflix': require('../../assets/logos/netflix.png'),
  'YouTube Premium': require('../../assets/logos/youtube.png'),
  'YouTube 채널 멤버십': require('../../assets/logos/youtube.png'),
  'YouTube Music': require('../../assets/logos/youtubemusic.png'),
  'Disney+': require('../../assets/logos/disneyplus.png'),
  'Wavve': require('../../assets/logos/wavve.png'),
  'Tving': require('../../assets/logos/tving.png'),
  'Watcha': require('../../assets/logos/watcha.png'),
  'Apple TV+': require('../../assets/logos/appletv.png'),
  'Coupang Play': require('../../assets/logos/coupangplay.png'),
  'Amazon Prime Video': require('../../assets/logos/primevideo.png'),
  'Laftel': require('../../assets/logos/laftel.png'),
  'Paramount+': require('../../assets/logos/paramount.png'),
  'Spotify': require('../../assets/logos/spotify.png'),
  'Apple Music': require('../../assets/logos/applemusic.png'),
  'Melon': require('../../assets/logos/melon.png'),
  'Genie Music': require('../../assets/logos/genie.png'),
  'FLO': require('../../assets/logos/flo.png'),
  'VIBE': require('../../assets/logos/vibe.png'),
  'Bugs': require('../../assets/logos/bugs.png'),
  'Tidal': require('../../assets/logos/tidal.png'),
  'GitHub Copilot': require('../../assets/logos/github.png'),
  'JetBrains All Products': require('../../assets/logos/jetbrains.png'),
  'ChatGPT Plus': require('../../assets/logos/chatgpt.png'),
  'Claude Pro': require('../../assets/logos/claude.png'),
  'Notion': require('../../assets/logos/notion.png'),
  'Figma': require('../../assets/logos/figma.png'),
  'Cursor': require('../../assets/logos/cursor.png'),
  'Midjourney': require('../../assets/logos/midjourney.png'),
  'Perplexity Pro': require('../../assets/logos/perplexity.png'),
  'GitLab': require('../../assets/logos/gitlab.png'),
  'Replit': require('../../assets/logos/replit.png'),
  'Apple Developer Program': require('../../assets/logos/appledeveloper.png'),
  'Vercel': require('../../assets/logos/vercel.png'),
  'Netlify': require('../../assets/logos/netlify.png'),
  'AWS': require('../../assets/logos/aws.png'),
  'Railway': require('../../assets/logos/railway.png'),
  'DigitalOcean': require('../../assets/logos/digitalocean.png'),
  'Cloudflare': require('../../assets/logos/cloudflare.png'),
  'Microsoft 365': require('../../assets/logos/microsoft365.png'),
  'Google One': require('../../assets/logos/googleone.png'),
  'Dropbox': require('../../assets/logos/dropbox.png'),
  'Adobe Creative Cloud': require('../../assets/logos/adobe.png'),
  'Slack': require('../../assets/logos/slack.png'),
  'Zoom': require('../../assets/logos/zoom.png'),
  'Canva Pro': require('../../assets/logos/canva.png'),
  'Todoist': require('../../assets/logos/todoist.png'),
  'Grammarly': require('../../assets/logos/grammarly.png'),
  'Miro': require('../../assets/logos/miro.png'),
  'Linear': require('../../assets/logos/linear.png'),
  'Duolingo Plus': require('../../assets/logos/duolingo.png'),
  'LinkedIn Premium': require('../../assets/logos/linkedin.png'),
  'Coursera Plus': require('../../assets/logos/coursera.png'),
  'Class101': require('../../assets/logos/class101.png'),
  '인프런': require('../../assets/logos/inflearn.png'),
  '밀리의 서재': require('../../assets/logos/millie.png'),
  '리디 셀렉트': require('../../assets/logos/ridibooks.png'),
  '예스24 크레마클럽': require('../../assets/logos/yes24.png'),
  '교보문고 sam': require('../../assets/logos/kyobo.png'),
  '윌라': require('../../assets/logos/welaaa.png'),
  'Kindle Unlimited': require('../../assets/logos/kindleunlimited.png'),
  'Audible': require('../../assets/logos/audible.png'),
  'Nintendo Switch Online': require('../../assets/logos/nintendo.png'),
  'PlayStation Plus': require('../../assets/logos/playstation.png'),
  'Xbox Game Pass': require('../../assets/logos/xbox.png'),
  'Discord Nitro': require('../../assets/logos/discord.png'),
  'EA Play': require('../../assets/logos/ea.png'),
  'Steam': require('../../assets/logos/steam.png'),
  'Calm': require('../../assets/logos/calm.png'),
  'Headspace': require('../../assets/logos/headspace.png'),
  'Strava': require('../../assets/logos/strava.png'),
  'Nike Run Club+': require('../../assets/logos/nike.png'),
  'FatSecret Premium': require('../../assets/logos/fatsecret.png'),
  'The New York Times': require('../../assets/logos/nytimes.png'),
  'Medium': require('../../assets/logos/medium.png'),
  'The Economist': require('../../assets/logos/economist.png'),
  '조선일보 디지털': require('../../assets/logos/chosun.png'),
  '중앙일보 디지털': require('../../assets/logos/joongang.png'),
  'iCloud+': require('../../assets/logos/icloud.png'),
  'pCloud': require('../../assets/logos/pcloud.png'),
  'MEGA': require('../../assets/logos/mega.png'),
  'NordVPN': require('../../assets/logos/nordvpn.png'),
  'ExpressVPN': require('../../assets/logos/expressvpn.png'),
  'Surfshark': require('../../assets/logos/surfshark.png'),
  '1Password': require('../../assets/logos/1password.png'),
  'Bitwarden': require('../../assets/logos/bitwarden.png'),
  '쿠팡 로켓와우': require('../../assets/logos/coupang.png'),
  '네이버 플러스 멤버십': require('../../assets/logos/naver.png'),
  '배민클럽': require('../../assets/logos/baemin.png'),
  '카카오톡 이모티콘 플러스': require('../../assets/logos/kakaotalk.png'),
  'Amazon Prime': require('../../assets/logos/amazonprime.png'),
  // ── 사진·영상 ──
  'CapCut Pro': require('../../assets/logos/capcut.png'),
  'SNOW VIP': require('../../assets/logos/snow.png'),
  'VLLO': require('../../assets/logos/vllo.png'),
  'KineMaster Premium': require('../../assets/logos/kinemaster.png'),
  'Vrew': require('../../assets/logos/vrew.png'),
  'Adobe Lightroom': require('../../assets/logos/lightroom.png'),
  'Picsart Pro': require('../../assets/logos/picsart.png'),
  'VSCO': require('../../assets/logos/vsco.png'),
};

// ── 브랜드 배경색 (fallback용) ──
const BRAND_BG: Record<string, { bg: string; text: string }> = {
  'Netflix': { bg: '#E50914', text: '#FFF' },
  'Spotify': { bg: '#1DB954', text: '#FFF' },
  'YouTube Premium': { bg: '#FF0000', text: '#FFF' },
  'Disney+': { bg: '#113CCF', text: '#FFF' },
  'ChatGPT Plus': { bg: '#10A37F', text: '#FFF' },
  'Claude Pro': { bg: '#D4A574', text: '#FFF' },
  'Figma': { bg: '#A259FF', text: '#FFF' },
  'Notion': { bg: '#2D2D2D', text: '#FFF' },
  'Slack': { bg: '#4A154B', text: '#FFF' },
  'CapCut Pro': { bg: '#000000', text: '#FFF' },
  'SNOW VIP': { bg: '#00CDF5', text: '#FFF' },
  'VLLO': { bg: '#FE2959', text: '#FFF' },
  'KineMaster Premium': { bg: '#FD473B', text: '#FFF' },
  'Vrew': { bg: '#14A1C8', text: '#FFF' },
  'Adobe Lightroom': { bg: '#001E36', text: '#31A8FF' },
  'Picsart Pro': { bg: '#CA0AC1', text: '#FFF' },
  'VSCO': { bg: '#000000', text: '#FFF' },
};

interface ServiceLogoProps {
  name: string;
  size?: number;
}

export function ServiceLogo({ name, size = 44 }: ServiceLogoProps) {
  const logo = LOGOS[name];
  const borderRadius = size * 0.26;
  const imgSize = size * 0.75;

  if (logo) {
    return (
      <View style={[styles.container, { width: size, height: size, borderRadius }]}>
        <Image source={logo} style={{ width: imgSize, height: imgSize }} resizeMode="contain" />
      </View>
    );
  }

  // Fallback
  const brand = BRAND_BG[name] ?? { bg: '#6B7D8E', text: '#FFF' };
  const letter = name.charAt(0).toUpperCase();

  return (
    <View style={[styles.container, { width: size, height: size, borderRadius, backgroundColor: brand.bg }]}>
      <Text style={[styles.letter, { fontSize: size * 0.42, color: brand.text }]} numberOfLines={1}>
        {letter}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    backgroundColor: '#F5F5F5',
  },
  letter: {
    fontWeight: '800',
    letterSpacing: -0.5,
    textAlign: 'center',
  },
});
