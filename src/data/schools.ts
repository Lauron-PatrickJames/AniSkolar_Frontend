// Secondary schools students commonly come from, for the "school attended"
// fields: the student types to search, picks one, or types a school that
// isn't listed. Picking one fills in its type (and its city, if the address
// is still empty). Add schools here as the AdSO asks; keep the names as the
// schools write them.

export interface SchoolOption {
  name: string;
  type: 'Public' | 'Private';
  city: string; // "City, Province"
}

export const SCHOOLS: SchoolOption[] = [
  // Cavite, private
  { name: 'De La Salle University-Dasmariñas Integrated School', type: 'Private', city: 'Dasmariñas, Cavite' },
  { name: 'Emilio Aguinaldo College-Cavite', type: 'Private', city: 'Dasmariñas, Cavite' },
  { name: 'Philippine Christian University-Dasmariñas', type: 'Private', city: 'Dasmariñas, Cavite' },
  { name: 'Lyceum of the Philippines University-Cavite', type: 'Private', city: 'General Trias, Cavite' },
  { name: 'University of Perpetual Help System DALTA-Molino', type: 'Private', city: 'Bacoor, Cavite' },
  { name: 'Saint Dominic College of Asia', type: 'Private', city: 'Bacoor, Cavite' },
  { name: 'St. Francis of Assisi College-Bacoor', type: 'Private', city: 'Bacoor, Cavite' },
  { name: 'STI College-Bacoor', type: 'Private', city: 'Bacoor, Cavite' },
  { name: 'Imus Institute of Science and Technology', type: 'Private', city: 'Imus, Cavite' },
  { name: 'San Sebastian College-Recoletos de Cavite', type: 'Private', city: 'Cavite City, Cavite' },
  { name: 'St. Joseph College-Cavite', type: 'Private', city: 'Cavite City, Cavite' },
  { name: 'Rogationist College', type: 'Private', city: 'Silang, Cavite' },
  { name: 'Adventist University of the Philippines Academy', type: 'Private', city: 'Silang, Cavite' },
  { name: 'Olivarez College-Tagaytay', type: 'Private', city: 'Tagaytay, Cavite' },

  // Cavite, public
  { name: 'Dasmariñas Integrated High School', type: 'Public', city: 'Dasmariñas, Cavite' },
  { name: 'Imus National High School', type: 'Public', city: 'Imus, Cavite' },
  { name: 'Bacoor National High School', type: 'Public', city: 'Bacoor, Cavite' },
  { name: 'Cavite National High School', type: 'Public', city: 'Cavite City, Cavite' },
  { name: 'Gov. Ferrer Memorial National High School', type: 'Public', city: 'General Trias, Cavite' },
  { name: 'Trece Martires City National High School', type: 'Public', city: 'Trece Martires, Cavite' },
  { name: 'Tagaytay City National High School', type: 'Public', city: 'Tagaytay, Cavite' },
  { name: 'Carmona National High School', type: 'Public', city: 'Carmona, Cavite' },
  { name: 'Tanza National Comprehensive High School', type: 'Public', city: 'Tanza, Cavite' },
  { name: 'Cavite State University Laboratory School', type: 'Public', city: 'Indang, Cavite' },

  // Nearby
  { name: 'De La Salle Santiago Zobel School', type: 'Private', city: 'Muntinlupa, Metro Manila' },
  { name: 'La Salle Green Hills', type: 'Private', city: 'Mandaluyong, Metro Manila' },
  { name: 'De La Salle Lipa', type: 'Private', city: 'Lipa, Batangas' },
  { name: 'University of Perpetual Help System DALTA-Las Piñas', type: 'Private', city: 'Las Piñas, Metro Manila' },
  { name: 'Colegio San Agustin-Biñan', type: 'Private', city: 'Biñan, Laguna' },
  { name: 'Philippine Science High School-CALABARZON Region Campus', type: 'Public', city: 'Batangas City, Batangas' },
];

export const findSchool = (name: string) => {
  const key = name.trim().toLowerCase();
  return key ? SCHOOLS.find(s => s.name.toLowerCase() === key) : undefined;
};

// One <datalist> per page, referenced by every school input.
export const SCHOOL_LIST_ID = 'aniskolar-schools';
