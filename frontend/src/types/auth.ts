export interface ProducerProfile {
  id: string;
  fullName: string;
  mobileNumber: string;
  preferredLanguage?: string;
  farmerReferenceNumber?: string | null;
}

export interface SendOtpResponseData {
  message: string;
  maskedMobile: string;
  cooldownSeconds: number;
  expiresInSeconds: number;
}

export interface VerifyOtpResponseData {
  token: string;
  farmer: ProducerProfile;
}

export interface AuthContextType {
  producerToken: string | null;
  activeProducer: ProducerProfile | null;
  isAuthenticated: boolean;
  login: (token: string, farmer: ProducerProfile) => void;
  logout: () => void;
  isOwnerOfFarm: (farmerId?: string | null) => boolean;
}
