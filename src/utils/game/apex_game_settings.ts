import type {
  ApexBinding,
  ApexGameSettingDefinition,
} from '@/types/apex_game_settings.ts';

/** Return the existing binding that would collide with a proposed input. */
export function findApexBindingConflict(
  bindings: readonly ApexBinding[],
  targetId: string,
  input: string,
): ApexBinding | undefined {
  const normalized = input.toUpperCase();
  return bindings.find(binding => (
    binding.id !== targetId && binding.input.toUpperCase() === normalized
  ));
}

/** Keep the editable catalog internally consistent before it reaches the UI. */
export function validateApexGameSettingsCatalog(
  fields: readonly ApexGameSettingDefinition[],
): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  const keys = new Set<string>();
  for (const field of fields) {
    if (ids.has(field.id)) errors.push(`duplicate id: ${field.id}`);
    ids.add(field.id);
    const qualifiedKey = `${field.file}:${field.key}`;
    if (keys.has(qualifiedKey)) errors.push(`duplicate key: ${qualifiedKey}`);
    keys.add(qualifiedKey);
    if (!field.labelKey || !field.descriptionKey) {
      errors.push(`missing labels: ${field.id}`);
    }
    if (field.control === 'number') {
      if (field.min === undefined || field.max === undefined || field.step === undefined) {
        errors.push(`missing numeric range: ${field.id}`);
      } else if (field.min > field.max || field.step <= 0) {
        errors.push(`invalid numeric range: ${field.id}`);
      }
    }
    if ((field.control === 'toggle' || field.control === 'enum')
      && (!field.options || field.options.length === 0)) {
      errors.push(`missing options: ${field.id}`);
    }
  }
  return errors;
}
