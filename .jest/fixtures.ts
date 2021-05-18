export const groupFixtures: Record<
  string,
  { members: ReadonlyArray<string> }
> = {
  'a358d675-46ef-5b6c-85ac-d8bbb1410e73': {
    members: [
      '6215c125-4a6e-50b9-822a-86fe33f8172f',
      '1ee5e1d3-40dc-5ae1-aa51-aca7a832ddea',
      'edf32347-6d27-533f-a8ee-2898c657a184',
    ],
  },
  'a8a90f06-89fc-5633-9205-0f37699f0eb6': {
    members: [
      '98feceb2-1ea1-5a8a-b818-4eb19c32166a',
      '8a58f666-46a9-522b-b40a-484b09db59ec',
    ],
  },
  '88947dfb-06b4-5d8d-acea-1dc475524471': {
    members: [
      '98feceb2-1ea1-5a8a-b818-4eb19c32166a',
      'edf32347-6d27-533f-a8ee-2898c657a184',
    ],
  },
};

export const userFixtures = {
  '6215c125-4a6e-50b9-822a-86fe33f8172f': {
    id: '6215c125-4a6e-50b9-822a-86fe33f8172f',
    userName: 'ccamolli0@blogspot.com',
    name: {
      givenName: 'Cleve',
      familyName: 'Camolli',
    },
    displayName: 'Cleve Camolli',
    emails: [
      {
        value: 'ccamolli0@blogspot.com',
        type: 'work',
        primary: true,
      },
    ],
    active: true,
  },
  '98feceb2-1ea1-5a8a-b818-4eb19c32166a': {
    id: '98feceb2-1ea1-5a8a-b818-4eb19c32166a',
    userName: 'pcondict0@tiny.cc',
    name: {
      givenName: 'Pamelina',
      familyName: 'Condict',
    },
    displayName: 'Pamelina Condict',
    emails: [
      {
        value: 'pcondict0@tiny.cc',
        type: 'work',
        primary: true,
      },
    ],
    active: true,
  },
  '1ee5e1d3-40dc-5ae1-aa51-aca7a832ddea': {
    id: '1ee5e1d3-40dc-5ae1-aa51-aca7a832ddea',
    userName: 'lwackley1@storify.com',
    name: {
      givenName: 'Lyndsie',
      familyName: 'Wackley',
    },
    displayName: 'Lyndsie Wackley',
    emails: [
      {
        value: 'lwackley1@storify.com',
        type: 'work',
        primary: true,
      },
    ],
    active: true,
  },
  '8a58f666-46a9-522b-b40a-484b09db59ec': {
    id: '8a58f666-46a9-522b-b40a-484b09db59ec',
    userName: 'lwackley1@storify.com',
    name: {
      givenName: 'Matilde',
      familyName: 'Paxforde',
    },
    displayName: 'Matilde Paxforde',
    emails: [
      {
        value: 'mpaxforde2@census.gov',
        type: 'work',
        primary: true,
      },
    ],
    active: true,
  },
  'edf32347-6d27-533f-a8ee-2898c657a184': {
    id: 'edf32347-6d27-533f-a8ee-2898c657a184',
    userName: 'odaniele3@paypal.com',
    name: {
      givenName: 'Osborne',
      familyName: 'Daniele',
    },
    displayName: 'Osborne Daniele',
    emails: [
      {
        value: 'odaniele3@paypal.com',
        type: 'work',
        primary: true,
      },
    ],
    active: true,
  },
};
