import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';

import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { SkipCsrf } from './decorators/skip-csrf.decorator';
import { AcceptInvitationDto } from './dto/accept-invitation.dto';
import { AuthResponseDto } from './dto/auth-response.dto';
import { LoginDto } from './dto/login.dto';
import { SessionResponseDto } from './dto/session-response.dto';
import { AuthService } from './auth.service';
import { TokenService } from './token.service';
import type { AuthenticatedPrincipal } from './types/authenticated-request';

@ApiTags('auth')
@Controller('api/v1/auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly tokenService: TokenService,
  ) {}

  @Public()
  @SkipCsrf()
  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Login and set HTTP-only auth cookies.' })
  @ApiOkResponse({ type: AuthResponseDto })
  async login(@Body() dto: LoginDto, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const result = await this.authService.login(dto, this.requestMetadata(request));
    this.setAuthCookies(response, result);

    return {
      ...result.auth,
      csrfToken: result.csrfToken,
    };
  }

  @Public()
  @SkipCsrf()
  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({ summary: 'Rotate refresh token and issue a new access session.' })
  @ApiOkResponse({ type: AuthResponseDto })
  async refresh(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const result = await this.authService.refresh(
      this.readCookie(request, this.tokenService.cookieNames.refresh),
      this.requestMetadata(request),
    );
    this.setAuthCookies(response, result);

    return {
      ...result.auth,
      csrfToken: result.csrfToken,
    };
  }

  @Public()
  @SkipCsrf()
  @Post('invitations/accept')
  @HttpCode(200)
  @ApiOperation({ summary: 'Accept an account invitation and set the first password.' })
  @ApiOkResponse({ schema: { example: { accepted: true, email: 'employee@company.com', tenantSlug: 'acme' } } })
  async acceptInvitation(@Body() dto: AcceptInvitationDto) {
    return this.authService.acceptInvitation(dto);
  }

  @Post('logout')
  @HttpCode(200)
  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: 'Revoke the current browser session.' })
  @ApiOkResponse({ schema: { example: { loggedOut: true } } })
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const result = await this.authService.logout(
      this.readCookie(request, this.tokenService.cookieNames.access),
      this.readCookie(request, this.tokenService.cookieNames.refresh),
    );

    this.clearAuthCookies(response);
    return result;
  }

  @Post('logout-all')
  @HttpCode(200)
  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: 'Revoke all sessions and refresh tokens for the current user.' })
  @ApiOkResponse({ schema: { example: { loggedOut: true } } })
  async logoutAll(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.logoutAll(user.id, user.identityId);
    this.clearAuthCookies(response);
    return result;
  }

  @Get('me')
  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: 'Return the authenticated principal and resolved permissions.' })
  @ApiOkResponse({ type: AuthResponseDto })
  async me(@CurrentUser() user: AuthenticatedPrincipal) {
    return this.authService.getMe(user.id);
  }

  @Get('workspaces')
  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: 'List workspaces available to the authenticated identity.' })
  @ApiOkResponse({ schema: { example: [{ membershipId: 'uuid', displayName: 'Acme Health', slug: 'acme-health' }] } })
  async workspaces(@CurrentUser() user: AuthenticatedPrincipal) {
    return this.authService.listWorkspaces(user);
  }

  @Post('workspaces/:membershipId/switch')
  @HttpCode(200)
  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: 'Switch the browser session into another identity membership.' })
  @ApiOkResponse({ type: AuthResponseDto })
  async switchWorkspace(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('membershipId') membershipId: string,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.switchWorkspace(
      user,
      membershipId,
      this.requestMetadata(request),
      this.readCookie(request, this.tokenService.cookieNames.access),
      this.readCookie(request, this.tokenService.cookieNames.refresh),
    );
    this.setAuthCookies(response, result);

    return {
      ...result.auth,
      csrfToken: result.csrfToken,
    };
  }

  @Get('sessions')
  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: 'List browser sessions for the current user.' })
  @ApiOkResponse({ type: SessionResponseDto, isArray: true })
  async sessions(@CurrentUser() user: AuthenticatedPrincipal) {
    return this.authService.listSessions(user.id, user.sessionId);
  }

  @Delete('sessions')
  @HttpCode(200)
  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: 'Revoke all other browser sessions for the current user.' })
  @ApiOkResponse({ schema: { example: { revokedSessions: 3, revokedRefreshTokens: 3 } } })
  async revokeOtherSessions(@CurrentUser() user: AuthenticatedPrincipal, @Req() request: Request) {
    return this.authService.revokeOtherSessions(
      user.id,
      user.sessionId,
      this.readCookie(request, this.tokenService.cookieNames.refresh),
    );
  }

  @Delete('sessions/:id')
  @HttpCode(200)
  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: 'Revoke one browser session for the current user.' })
  @ApiNoContentResponse({ description: 'Session revoked.' })
  async revokeSession(@CurrentUser() user: AuthenticatedPrincipal, @Param('id') sessionId: string) {
    return this.authService.revokeSession(user.id, sessionId);
  }

  private setAuthCookies(
    response: Response,
    result:
      | Awaited<ReturnType<AuthService['login']>>
      | Awaited<ReturnType<AuthService['refresh']>>
      | Awaited<ReturnType<AuthService['switchWorkspace']>>,
  ) {
    response.cookie(
      this.tokenService.cookieNames.access,
      result.access.raw,
      this.tokenService.accessCookieOptions(result.access.expiresAt),
    );
    response.cookie(
      this.tokenService.cookieNames.refresh,
      result.refresh.raw,
      this.tokenService.refreshCookieOptions(result.refresh.expiresAt),
    );
    response.cookie(
      this.tokenService.cookieNames.csrf,
      result.csrfToken,
      this.tokenService.csrfCookieOptions(result.refresh.expiresAt),
    );
  }

  private clearAuthCookies(response: Response) {
    response.clearCookie(this.tokenService.cookieNames.access, this.tokenService.clearCookieOptions());
    response.clearCookie(this.tokenService.cookieNames.refresh, this.tokenService.clearCookieOptions());
    response.clearCookie(this.tokenService.cookieNames.csrf, this.tokenService.csrfClearCookieOptions());
  }

  private readCookie(request: Request, name: string): string | undefined {
    const cookies = request.cookies as Record<string, string | undefined> | undefined;
    return cookies?.[name];
  }

  private requestMetadata(request: Request) {
    return {
      ipAddress: request.ip,
      userAgent: request.header('user-agent'),
    };
  }
}
