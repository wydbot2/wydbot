type CreateRandomUuid = () => string;

const createRandomUuid: CreateRandomUuid = () => crypto.randomUUID();

/** UUID seed sent to main; the host MAC never leaves the privileged process. */
export const generateHardwareIdentitySeed = (create = createRandomUuid): string => create();
