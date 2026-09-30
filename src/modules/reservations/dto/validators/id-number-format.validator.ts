import {
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';

@ValidatorConstraint({ name: 'IdNumberFormat', async: false })
export class IdNumberFormatValidator implements ValidatorConstraintInterface {
  validate(idNumber: string, args: ValidationArguments) {
    if (typeof idNumber !== 'string') {
      return false;
    }

    const obj = args.object as { idType?: string };
    switch (obj?.idType) {
      case 'KTP':
        return /^\d{16}$/.test(idNumber); // NIK selalu 16 digit angka
      case 'SIM':
        return /^\d{12,16}$/.test(idNumber); // SIM Indonesia umumnya 12-16 digit angka
      case 'PASSPORT':
        return /^[A-Za-z0-9]{6,9}$/.test(idNumber); // Format nomor paspor internasional (alfanumerik 6-9 digit)
      case 'OTHER':
        return idNumber.length >= 4 && idNumber.length <= 30; // Batas wajar untuk dokumen identitas lain
      default:
        return false;
    }
  }

  defaultMessage(args: ValidationArguments) {
    const obj = args.object as { idType?: string };
    return `Format nomor identitas tidak valid untuk jenis dokumen ${obj?.idType ?? 'yang dipilih'}`;
  }
}
