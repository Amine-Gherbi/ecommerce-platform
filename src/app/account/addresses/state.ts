export interface AddressFormState {
  error: string | null;
  ok: boolean;
}

export const initialAddressFormState: AddressFormState = {
  error: null,
  ok: false,
};

export type AddressFormAction = (
  state: AddressFormState,
  formData: FormData,
) => Promise<AddressFormState>;

export interface AddressFormValues {
  id?: string;
  label: string;
  line1: string;
  line2: string | null;
  city: string;
  postalCode: string;
  country: string;
  isDefault: boolean;
}
