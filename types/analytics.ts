export interface UsersByStatus {
  active?: number;
  inactive?: number;
  suspended?: number;
  pending?: number;
  [k: string]: number | undefined;
}

export interface UsersByRole {
  customer?: number;
  seller?: number;
  admin?: number;
  support?: number;
  [k: string]: number | undefined;
}

export interface RecentUser {
  _id: string;
  name: string;
  email: string;
  image: string | null;
  role: string;
  status: string;
  joinDate: string;
  lastActive: string;
}

export interface UserAnalytics {
  totalUsers: number;
  activeUsers: number;
  newUsersThisMonth: number;
  userGrowthRate: number;
  usersByStatus: UsersByStatus;
  usersByRole: UsersByRole;
  monthlySignups: number[];
  recentUsers: RecentUser[];
}

export interface ProductAnalytics {
  totalProducts: number;
  activeProducts: number;
  outOfStock: number;
  lowStock: number;
  productsByStatus: Record<string, number>;
  productsByCategory: Record<string, number>;
  monthlyAdditions: number[];
  recentProducts: any[];
}
