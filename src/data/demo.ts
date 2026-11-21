export type Buddy = {
  id: string
  name: string
  age: number
  area: string
  distance: string
  intent: string
  interests: string[]
  image: string
  available: string
  bio: string
}

export const buddies: Buddy[] = [
  {
    id: 'maya', name: 'Maya', age: 27, area: 'Westlands', distance: '2.1 km',
    intent: 'New friendships', interests: ['Cocktails', 'Afrobeats', 'Rooftops'],
    image: 'https://images.unsplash.com/photo-1534525153417-7a3b4b8b4b4b?auto=format&fit=crop&w=900&q=85',
    available: 'Tonight', bio: 'Always up for good conversation, live music and discovering new spots.',
  },
  {
    id: 'brian', name: 'Brian', age: 29, area: 'Kilimani', distance: '4.8 km',
    intent: 'Drinking buddies', interests: ['Craft beer', 'Football', 'Live music'],
    image: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=900&q=85',
    available: 'This weekend', bio: 'Easy-going, big football fan. Looking to meet good people around Nairobi.',
  },
  {
    id: 'njeri', name: 'Njeri', age: 26, area: 'Lavington', distance: '5.3 km',
    intent: 'Social and dating', interests: ['Wine bars', 'Jazz', 'Food'],
    image: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=900&q=85',
    available: 'Tonight', bio: 'Good food, better playlists and spontaneous plans. Here to make connections.',
  },
]

export const meetups = [
  { id: 'm1', area: 'Westlands', title: 'Friday unwind', detail: 'Easy evening, new faces and good music.', time: 'Tonight · 8:00 PM', spots: '3 spots left', people: '5 going', image: 'https://images.unsplash.com/photo-1514933651103-005eec06c04b?auto=format&fit=crop&w=1000&q=85' },
  { id: 'm2', area: 'Kilimani', title: 'Live music crew', detail: 'Looking for people who enjoy live bands.', time: 'Saturday · 7:30 PM', spots: '4 spots left', people: '4 going', image: 'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd8?auto=format&fit=crop&w=1000&q=85' },
]

export const venues = [
  { name: 'The Social House', area: 'Lavington', type: 'Restaurant & lounge', image: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=900&q=85' },
  { name: 'Hero Bar', area: 'Westlands', type: 'Bar & grill', image: 'https://images.unsplash.com/photo-1514933651103-005eec06c04b?auto=format&fit=crop&w=900&q=85' },
  { name: 'About Thyme', area: 'Riverside', type: 'Restaurant', image: 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=900&q=85' },
]