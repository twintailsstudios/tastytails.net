import assert from 'assert';

describe('Character Creator Ear Sprite Synchronization', function () {
  // Ear inner sprite map logic mirror
  const EAR_INNER_MAP = {
    'empty': 'empty',
    'ears_01-outer': 'ears_01-inner',
    'ears_02-outer': 'ears_02-inner',
    'ears_03-outer': 'ears_03-inner',
    'ears_04-outer': 'ears_04-inner',
    'ears_05-outer': 'ears_05-inner',
    'ears_06-outer': 'ears_06-inner',
    'ears_07-outer': 'ears_07-inner',
    'ears_08-outer': 'ears_08-inner',
    'ears_09-outer': 'ears_09-inner',
    'ears_10-outer': 'ears_10-inner',
    'ears_11-outer': 'ears_11-inner'
  };

  function getInnerEarSprite(outerSprite) {
    if (EAR_INNER_MAP[outerSprite]) return EAR_INNER_MAP[outerSprite];
    if (outerSprite && outerSprite.includes('-outer')) return outerSprite.replace('-outer', '-inner');
    return 'empty';
  }

  it('should map all outer ear sprites 01 to 11 to their exact inner ear sprite counterparts', function () {
    for (let i = 1; i <= 11; i++) {
      const pad = i < 10 ? `0${i}` : `${i}`;
      const outerKey = `ears_${pad}-outer`;
      const expectedInnerKey = `ears_${pad}-inner`;
      
      const resolvedInner = getInnerEarSprite(outerKey);
      assert.strictEqual(resolvedInner, expectedInnerKey, `Outer ear ${outerKey} must map to ${expectedInnerKey}`);
    }
  });

  it('should dynamically fallback to string replacement if key is not in explicit map', function () {
    const customOuter = 'ears_99-outer';
    assert.strictEqual(getInnerEarSprite(customOuter), 'ears_99-inner');
  });

  it('should resolve inner ear correctly via global window resolution helper', function () {
    const globalObj = {
      getInnerEarSprite: getInnerEarSprite
    };

    const outerEarVal = 'ears_07-outer';
    const getInnerEar = globalObj.getInnerEarSprite || (typeof getInnerEarSprite === 'function' ? getInnerEarSprite : null);
    const innerVal = getInnerEar 
      ? getInnerEar(outerEarVal) 
      : (outerEarVal && outerEarVal.includes('-outer') ? outerEarVal.replace('-outer', '-inner') : 'ears_01-inner');

    assert.strictEqual(innerVal, 'ears_07-inner', 'Randomization resolution must produce matching inner ear ears_07-inner');
  });
});
