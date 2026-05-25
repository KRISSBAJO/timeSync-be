import { Test } from '@nestjs/testing';

import { AppController } from './app.controller';

describe('AppController', () => {
  let controller: AppController;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AppController],
    }).compile();

    controller = moduleRef.get(AppController);
  });

  it('returns API metadata', () => {
    expect(controller.getRoot()).toEqual({
      name: 'TimeSync HR API',
      version: '0.1.0',
      status: 'ready',
    });
  });
});

